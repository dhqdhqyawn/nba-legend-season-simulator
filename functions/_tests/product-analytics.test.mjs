import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnalyticsRows,
  enforceAnalyticsRateLimit,
  getAnalyticsSummary,
  normalizeAnalyticsPayload,
  persistAnalyticsRows,
  scheduleAnalyticsCleanup,
} from "../_lib/product-analytics.mjs";
import { onRequest as analyticsEventsRequest } from "../api/analytics/events.js";
import {
  onRequest as analyticsSummaryRequest,
  parseAnalyticsRange,
  requireAnalyticsAdmin,
} from "../api/analytics/summary.js";

const NOW = 1_785_816_000;

function payload(overrides = {}) {
  return {
    visitorId: "visitor_1234567890abcdef",
    sessionId: "session_1234567890abcdef",
    environment: "candidate",
    mode: "nba82",
    language: "zh",
    deviceClass: "mobile",
    entrySource: "direct",
    releaseVersion: "monitoring-1.0.0",
    events: [{
      id: "event_1234567890abcdef",
      name: "session_start",
      occurredAt: NOW * 1_000,
    }],
    ...overrides,
  };
}

test("normalizes a strict analytics batch and ignores unpersisted free text", () => {
  const normalized = normalizeAnalyticsPayload(payload({
    contactEmail: "must-not-persist@example.com",
    events: [{
      id: "event_1234567890abcdef",
      name: "pack_opened",
      occurredAt: NOW * 1_000,
      lineupCode: "must-not-persist",
    }],
  }), NOW);
  assert.equal(normalized.events.length, 1);
  assert.deepEqual(normalized.events[0], {
    id: "event_1234567890abcdef",
    name: "pack_opened",
    occurredAt: NOW,
    environment: "candidate",
    mode: "nba82",
    language: "zh",
    deviceClass: "mobile",
    entrySource: "direct",
    releaseVersion: "monitoring-1.0.0",
  });
  assert.equal("contactEmail" in normalized, false);
  assert.equal("lineupCode" in normalized.events[0], false);
});

test("rejects unknown event names, invalid identities, duplicate ids and oversized batches", () => {
  assert.throws(
    () => normalizeAnalyticsPayload(payload({
      events: [{ id: "event_1234567890abcdef", name: "player_name" }],
    }), NOW),
    (error) => error.code === "invalid_analytics_event_name",
  );
  assert.throws(
    () => normalizeAnalyticsPayload(payload({ visitorId: "short" }), NOW),
    (error) => error.code === "invalid_analytics_identity",
  );
  assert.throws(
    () => normalizeAnalyticsPayload(payload({
      events: [
        { id: "event_1234567890abcdef", name: "session_start" },
        { id: "event_1234567890abcdef", name: "pack_opened" },
      ],
    }), NOW),
    (error) => error.code === "duplicate_analytics_event",
  );
  assert.throws(
    () => normalizeAnalyticsPayload(payload({
      events: Array.from({ length: 21 }, (_, index) => ({
        id: `event_${String(index).padStart(16, "0")}`,
        name: "session_start",
      })),
    }), NOW),
    (error) => error.code === "invalid_analytics_batch",
  );
});

test("clamps implausible client timestamps to server time", () => {
  const normalized = normalizeAnalyticsPayload(payload({
    events: [{
      id: "event_1234567890abcdef",
      name: "session_start",
      occurredAt: (NOW - 200_000) * 1_000,
    }],
  }), NOW);
  assert.equal(normalized.events[0].occurredAt, NOW);
});

test("hashes anonymous browser ids and never stores their raw values", async () => {
  const normalized = normalizeAnalyticsPayload(payload(), NOW);
  const request = new Request("https://game.example/api/analytics/events", {
    headers: { "CF-Connecting-IP": "203.0.113.8" },
  });
  const built = await buildAnalyticsRows(request, { ANALYTICS_SALT: "test-salt" }, normalized, NOW);
  assert.equal(built.rows[0].visitorHash.length, 64);
  assert.equal(built.rows[0].sessionHash.length, 64);
  assert.notEqual(built.rows[0].visitorHash, normalized.visitorId);
  assert.equal(JSON.stringify(built.rows).includes(normalized.visitorId), false);
  assert.equal(JSON.stringify(built.rows).includes(normalized.sessionId), false);
});

test("persists only the fixed analytics columns and deduplicates through INSERT OR IGNORE", async () => {
  const prepared = [];
  const database = {
    prepare(sql) {
      const statement = {
        sql,
        args: [],
        bind(...args) { this.args = args; return this; },
      };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      assert.equal(statements.length, 1);
      return [{ meta: { changes: 1 } }];
    },
  };
  const inserted = await persistAnalyticsRows(database, [{
    id: "event_1234567890abcdef",
    name: "session_start",
    visitorHash: "a".repeat(64),
    sessionHash: "b".repeat(64),
    environment: "candidate",
    mode: "home",
    language: "zh",
    deviceClass: "desktop",
    entrySource: "direct",
    releaseVersion: "monitoring-1.0.0",
    occurredAt: NOW,
    receivedAt: NOW,
  }]);
  assert.equal(inserted, 1);
  assert.match(prepared[0].sql, /INSERT OR IGNORE INTO product_analytics_events/);
  assert.equal(prepared[0].args.length, 12);
});

test("enforces an event-count rate limit", async () => {
  const database = {
    prepare() {
      return {
        bind() { return this; },
        async first() { return { event_count: 121 }; },
      };
    },
  };
  await assert.rejects(
    enforceAnalyticsRateLimit(database, "a".repeat(64), 2, NOW, {}),
    (error) => error.code === "analytics_rate_limited" && error.status === 429,
  );
});

test("normalizes summary query rows and keeps legacy rooms explicitly separate", async () => {
  const results = [
    [{ activeVisitors: "9", returningVisitors: "2", sessions: "11", crossModeVisitors: "3" }],
    [{ day: "2026-08-04", activeVisitors: "9", returningVisitors: "2", sessions: "11" }],
    [{
      day: "2026-08-04",
      nba82Entrants: "7", nba82Starters: "6", nba82Completers: "5",
      nba5Entrants: "4", nba5Starters: "3", nba5Completers: "2",
      onlineEntrants: "2", onlineStarters: "1",
      packOpeners: "8", lineupCompleters: "6", sharers: "3",
    }],
    [{ eventName: "session_start", events: "12", visitors: "9" }],
    [{ mode: "nba82", visitors: "8", sessions: "10", starters: "7", completers: "6" }],
    [{ fromMode: "nba82", toMode: "nba5", transitions: "3", visitors: "2" }],
    [{ releaseVersion: "monitoring-1.0.0", visitors: "9", events: "12" }],
    [{ day: "2026-08-04", roomsCreated: "4", roomsComplete: "3" }],
  ];
  let queryIndex = 0;
  const queries = [];
  const database = {
    prepare(sql) {
      queries.push(sql);
      const current = queryIndex++;
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async all() { return { results: results[current] }; },
      };
    },
  };
  const summary = await getAnalyticsSummary(database, {
    windowKey: "30d",
    windowHours: 720,
    environment: "candidate",
    nowSeconds: NOW,
  });
  assert.equal(summary.environment, "candidate");
  assert.equal(summary.schemaVersion, "product-analytics-1.3.0");
  assert.equal(summary.totals.crossModeVisitors, 3);
  assert.equal(summary.daily[0].activeVisitors, 9);
  assert.equal(summary.daily[0].nba82Entrants, 7);
  assert.equal(summary.daily[0].nba82Starters, 6);
  assert.equal(summary.daily[0].nba82Completers, 5);
  assert.equal(summary.daily[0].nba5Entrants, 4);
  assert.equal(summary.daily[0].onlineStarters, 1);
  assert.equal(summary.daily[0].packOpeners, 8);
  assert.equal(summary.daily[0].lineupCompleters, 6);
  assert.equal(summary.daily[0].sharers, 3);
  assert.equal(summary.events[0].visitors, 9);
  assert.equal(summary.modes[0].completers, 6);
  assert.equal(summary.transitions[0].visitors, 2);
  assert.equal(summary.legacyRooms[0].roomsComplete, 3);
  assert.match(queries[2], /COUNT\(DISTINCT CASE[\s\S]+nba82_started/);
  assert.match(queries[2], /COUNT\(DISTINCT CASE[\s\S]+room_started/);
  assert.match(queries[0], /received_at < \?3/);
});

test("parses inclusive Beijing calendar dates and rejects unsafe ranges", () => {
  const parsed = parseAnalyticsRange(new URLSearchParams("from=2026-08-04&to=2026-08-06"));
  assert.deepEqual(parsed, {
    windowKey: "custom",
    windowHours: 72,
    rangeStart: Date.parse("2026-08-04T00:00:00+08:00") / 1_000,
    rangeEnd: Date.parse("2026-08-07T00:00:00+08:00") / 1_000,
    rangeFrom: "2026-08-04",
    rangeTo: "2026-08-06",
  });
  assert.throws(
    () => parseAnalyticsRange(new URLSearchParams("from=2026-08-06&to=2026-08-04")),
    (error) => error.code === "invalid_date_range",
  );
  assert.throws(
    () => parseAnalyticsRange(new URLSearchParams("from=2026-02-30&to=2026-03-01")),
    (error) => error.code === "invalid_date_range",
  );
  assert.throws(
    () => parseAnalyticsRange(new URLSearchParams("from=2026-01-01&to=2026-04-01")),
    (error) => error.code === "date_range_too_large",
  );
  assert.throws(
    () => parseAnalyticsRange(new URLSearchParams("window=7d&from=2026-08-04&to=2026-08-06")),
    (error) => error.code === "ambiguous_date_range",
  );
});

test("uses an exclusive upper bound for every custom-range aggregate", async () => {
  const bindings = [];
  const database = {
    prepare() {
      return {
        bind(...args) { bindings.push(args); return this; },
        async all() { return { results: [] }; },
      };
    },
  };
  const rangeStart = Date.parse("2026-08-04T00:00:00+08:00") / 1_000;
  const rangeEnd = Date.parse("2026-08-07T00:00:00+08:00") / 1_000;
  const summary = await getAnalyticsSummary(database, {
    windowKey: "custom",
    environment: "production",
    nowSeconds: NOW,
    rangeStart,
    rangeEnd,
    rangeFrom: "2026-08-04",
    rangeTo: "2026-08-06",
  });
  assert.equal(summary.bucketUnit, "hour");
  assert.deepEqual(summary.range, {
    from: "2026-08-04",
    to: "2026-08-06",
    startAt: new Date(rangeStart * 1_000).toISOString(),
    endAtExclusive: new Date(rangeEnd * 1_000).toISOString(),
  });
  assert.equal(bindings.length, 8);
  bindings.slice(0, 7).forEach((args) => assert.deepEqual(args, [
    rangeStart, "production", rangeEnd,
  ]));
  assert.deepEqual(bindings[7], [rangeStart, rangeEnd]);
});

test("fills empty per-bucket gameplay metrics with zero", async () => {
  const results = [
    [{ activeVisitors: "1", returningVisitors: "0", sessions: "1", crossModeVisitors: "0" }],
    [{ day: "2026-08-04 09:00", activeVisitors: "1", returningVisitors: "0", sessions: "1" }],
    [], [], [], [], [], [],
  ];
  let queryIndex = 0;
  const database = {
    prepare() {
      const current = queryIndex++;
      return {
        bind() { return this; },
        async all() { return { results: results[current] }; },
      };
    },
  };
  const summary = await getAnalyticsSummary(database, {
    windowKey: "12h",
    windowHours: 12,
    environment: "candidate",
    nowSeconds: NOW,
  });
  assert.equal(summary.bucketUnit, "hour");
  assert.equal(summary.daily[0].nba82Entrants, 0);
  assert.equal(summary.daily[0].nba5Completers, 0);
  assert.equal(summary.daily[0].onlineStarters, 0);
  assert.equal(summary.daily[0].packOpeners, 0);
  assert.equal(summary.daily[0].sharers, 0);
});

test("cleanup respects the retention boundary when explicitly selected", async () => {
  const cutoffs = [];
  let scheduled;
  const database = {
    prepare() {
      return {
        bind(value) { cutoffs.push(value); return this; },
        async run() { return { success: true }; },
      };
    },
  };
  scheduleAnalyticsCleanup({ waitUntil(promise) { scheduled = promise; } }, database, NOW, {}, () => 0);
  await scheduled;
  assert.deepEqual(cutoffs, [NOW - 90 * 86_400, NOW - 172_800]);
});

test("events endpoint accepts same-origin JSON without exposing anonymous ids", async () => {
  const database = {
    prepare(sql) {
      return {
        sql,
        bind() { return this; },
        async first() { return { event_count: 1 }; },
      };
    },
    async batch(statements) {
      assert.equal(statements.length, 1);
      return [{ meta: { changes: 1 } }];
    },
  };
  const request = new Request("https://game.example/api/analytics/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://game.example",
      "CF-Connecting-IP": "203.0.113.9",
    },
    body: JSON.stringify(payload()),
  });
  const response = await analyticsEventsRequest({
    request,
    env: { FEEDBACK_DB: database, ANALYTICS_SALT: "test-salt" },
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true, accepted: 1, inserted: 1 });
});

test("summary endpoint requires the existing administrator key", async () => {
  const request = new Request("https://game.example/api/analytics/summary?days=30");
  const response = await analyticsSummaryRequest({
    request,
    env: { FEEDBACK_DB: { prepare() {} }, FEEDBACK_ADMIN_KEY: "secret" },
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "unauthorized");
});

test("summary endpoint prefers an independent analytics administrator key", () => {
  const request = new Request("https://game.example/api/analytics/summary", {
    headers: { Authorization: "Bearer dashboard-secret" },
  });
  assert.doesNotThrow(() => requireAnalyticsAdmin(request, {
    ANALYTICS_ADMIN_KEY: "dashboard-secret",
    FEEDBACK_ADMIN_KEY: "feedback-secret",
  }));
  assert.throws(
    () => requireAnalyticsAdmin(new Request(request.url, {
      headers: { Authorization: "Bearer feedback-secret" },
    }), {
      ANALYTICS_ADMIN_KEY: "dashboard-secret",
      FEEDBACK_ADMIN_KEY: "feedback-secret",
    }),
    (error) => error.code === "unauthorized",
  );
});
