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
import { onRequest as analyticsSummaryRequest } from "../api/analytics/summary.js";

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
    [{ eventName: "session_start", events: "12", visitors: "9" }],
    [{ mode: "nba82", visitors: "8", sessions: "10", starters: "7", completers: "6" }],
    [{ fromMode: "nba82", toMode: "nba5", transitions: "3", visitors: "2" }],
    [{ releaseVersion: "monitoring-1.0.0", visitors: "9", events: "12" }],
    [{ day: "2026-08-04", roomsCreated: "4", roomsComplete: "3" }],
  ];
  let queryIndex = 0;
  const database = {
    prepare() {
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
  assert.equal(summary.totals.crossModeVisitors, 3);
  assert.equal(summary.daily[0].activeVisitors, 9);
  assert.equal(summary.events[0].visitors, 9);
  assert.equal(summary.modes[0].completers, 6);
  assert.equal(summary.transitions[0].visitors, 2);
  assert.equal(summary.legacyRooms[0].roomsComplete, 3);
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
