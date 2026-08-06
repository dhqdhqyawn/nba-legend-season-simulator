import { positiveInteger } from "./config.mjs";
import { ApiError } from "./errors.mjs";
import { clientFingerprint, sha256Hex } from "./security.mjs";

export const ANALYTICS_SCHEMA_VERSION = "product-analytics-1.3.0";
export const ANALYTICS_EVENT_NAMES = Object.freeze([
  "session_start",
  "mode_entered",
  "pack_opened",
  "lineup_completed",
  "nba82_started",
  "nba82_completed",
  "nba5_started",
  "nba5_completed",
  "room_created",
  "room_joined",
  "room_started",
  "result_shared",
]);

const EVENT_NAME_SET = new Set(ANALYTICS_EVENT_NAMES);
const ENVIRONMENTS = new Set(["production", "candidate", "local"]);
const MODES = new Set(["home", "nba82", "nba5", "online"]);
const LANGUAGES = new Set(["zh", "en"]);
const DEVICE_CLASSES = new Set(["mobile", "tablet", "desktop"]);
const ENTRY_SOURCES = new Set(["direct", "internal", "external"]);
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{12,80}$/;
const RELEASE_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const MAX_BATCH_EVENTS = 20;
const MAX_CLOCK_SKEW_SECONDS = 86_400;

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function enumValue(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function normalizeEvent(event, nowSeconds, shared) {
  if (!plainObject(event)) {
    throw new ApiError(400, "invalid_analytics_event", "统计事件格式无效。");
  }
  const id = String(event.id ?? "").trim();
  const name = String(event.name ?? "").trim();
  if (!EVENT_ID_PATTERN.test(id)) {
    throw new ApiError(400, "invalid_analytics_event_id", "统计事件 ID 无效。");
  }
  if (!EVENT_NAME_SET.has(name)) {
    throw new ApiError(400, "invalid_analytics_event_name", "统计事件名称无效。");
  }

  const suppliedOccurredAt = Number(event.occurredAt);
  const clientSeconds = Number.isFinite(suppliedOccurredAt)
    ? Math.floor(suppliedOccurredAt / 1_000)
    : nowSeconds;
  const occurredAt = Math.abs(clientSeconds - nowSeconds) <= MAX_CLOCK_SKEW_SECONDS
    ? clientSeconds
    : nowSeconds;

  return {
    id,
    name,
    occurredAt,
    environment: enumValue(event.environment, ENVIRONMENTS, shared.environment),
    mode: enumValue(event.mode, MODES, shared.mode),
    language: enumValue(event.language, LANGUAGES, shared.language),
    deviceClass: enumValue(event.deviceClass, DEVICE_CLASSES, shared.deviceClass),
    entrySource: enumValue(event.entrySource, ENTRY_SOURCES, shared.entrySource),
    releaseVersion: RELEASE_PATTERN.test(String(event.releaseVersion ?? ""))
      ? String(event.releaseVersion)
      : shared.releaseVersion,
  };
}

export function normalizeAnalyticsPayload(payload, nowSeconds = Math.floor(Date.now() / 1_000)) {
  if (!plainObject(payload)) {
    throw new ApiError(400, "invalid_analytics_payload", "统计请求格式无效。");
  }
  const visitorId = String(payload.visitorId ?? "").trim();
  const sessionId = String(payload.sessionId ?? "").trim();
  if (!OPAQUE_ID_PATTERN.test(visitorId) || !OPAQUE_ID_PATTERN.test(sessionId)) {
    throw new ApiError(400, "invalid_analytics_identity", "匿名统计标识无效。");
  }
  if (!Array.isArray(payload.events) || payload.events.length < 1 || payload.events.length > MAX_BATCH_EVENTS) {
    throw new ApiError(400, "invalid_analytics_batch", `每批统计事件应为 1–${MAX_BATCH_EVENTS} 条。`);
  }

  const shared = {
    environment: enumValue(payload.environment, ENVIRONMENTS, "production"),
    mode: enumValue(payload.mode, MODES, "home"),
    language: enumValue(payload.language, LANGUAGES, "zh"),
    deviceClass: enumValue(payload.deviceClass, DEVICE_CLASSES, "desktop"),
    entrySource: enumValue(payload.entrySource, ENTRY_SOURCES, "direct"),
    releaseVersion: RELEASE_PATTERN.test(String(payload.releaseVersion ?? ""))
      ? String(payload.releaseVersion)
      : "unknown",
  };

  const ids = new Set();
  const events = payload.events.map((event) => {
    const normalized = normalizeEvent(event, nowSeconds, shared);
    if (ids.has(normalized.id)) {
      throw new ApiError(400, "duplicate_analytics_event", "同一批次包含重复统计事件。");
    }
    ids.add(normalized.id);
    return normalized;
  });

  return { visitorId, sessionId, events };
}

function analyticsSalt(env) {
  const salt = String(env?.ANALYTICS_SALT || env?.RATE_LIMIT_SALT || "").trim();
  if (!salt) {
    throw new ApiError(503, "analytics_not_configured", "匿名统计尚未配置。");
  }
  return salt;
}

export async function buildAnalyticsRows(request, env, payload, nowSeconds) {
  const salt = analyticsSalt(env);
  const [visitorHash, sessionHash, clientHash] = await Promise.all([
    sha256Hex(`${salt}:product-analytics:visitor:${payload.visitorId}`),
    sha256Hex(`${salt}:product-analytics:session:${payload.sessionId}`),
    clientFingerprint(request, `${salt}:product-analytics:rate-limit`),
  ]);
  return {
    clientHash,
    rows: payload.events.map((event) => ({
      ...event,
      visitorHash,
      sessionHash,
      receivedAt: nowSeconds,
    })),
  };
}

export async function enforceAnalyticsRateLimit(database, clientHash, eventCount, nowSeconds, env) {
  const maxEvents = positiveInteger(env?.ANALYTICS_RATE_LIMIT_MAX, 120, { min: 20, max: 2_000 });
  const windowSeconds = positiveInteger(env?.ANALYTICS_RATE_LIMIT_WINDOW_SECONDS, 600, {
    min: 60,
    max: 86_400,
  });
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const row = await database.prepare(
    `INSERT INTO product_analytics_rate_limits (
      client_hash, window_start, event_count, last_seen_at
    ) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(client_hash, window_start) DO UPDATE SET
      event_count = event_count + excluded.event_count,
      last_seen_at = excluded.last_seen_at
    RETURNING event_count`,
  ).bind(clientHash, windowStart, eventCount, nowSeconds).first();
  const total = Number(row?.event_count ?? 0);
  if (total > maxEvents) {
    throw new ApiError(429, "analytics_rate_limited", "统计请求过于频繁。", {
      "Retry-After": String(Math.max(1, windowStart + windowSeconds - nowSeconds)),
    });
  }
  return { total, maxEvents, windowStart, windowSeconds };
}

export async function persistAnalyticsRows(database, rows) {
  const statements = rows.map((row) => database.prepare(
    `INSERT OR IGNORE INTO product_analytics_events (
      event_id, event_name, visitor_hash, session_hash, environment, mode, language,
      device_class, entry_source, release_version, occurred_at, received_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
  ).bind(
    row.id,
    row.name,
    row.visitorHash,
    row.sessionHash,
    row.environment,
    row.mode,
    row.language,
    row.deviceClass,
    row.entrySource,
    row.releaseVersion,
    row.occurredAt,
    row.receivedAt,
  ));
  const results = await database.batch(statements);
  return results.reduce((sum, result) => sum + Number(result?.meta?.changes ?? 0), 0);
}

function rowsFrom(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function numberFields(row, names) {
  const normalized = { ...row };
  for (const name of names) normalized[name] = Number(row?.[name] ?? 0);
  return normalized;
}

export async function getAnalyticsSummary(database, {
  days,
  windowHours: requestedWindowHours,
  windowKey,
  environment,
  nowSeconds,
  rangeStart,
  rangeEnd,
  rangeFrom = null,
  rangeTo = null,
}) {
  const hasCustomRange = Number.isFinite(rangeStart) && Number.isFinite(rangeEnd);
  const cutoff = hasCustomRange ? rangeStart : nowSeconds - (requestedWindowHours || days * 24) * 3_600;
  const endExclusive = hasCustomRange ? rangeEnd : nowSeconds + 1;
  const windowHours = hasCustomRange
    ? Math.ceil((endExclusive - cutoff) / 3_600)
    : requestedWindowHours || days * 24;
  const bucketUnit = windowHours <= 72 ? "hour" : "day";
  const bucketExpression = bucketUnit === "hour"
    ? "strftime('%Y-%m-%d %H:00', received_at, 'unixepoch', '+8 hours')"
    : "date(received_at, 'unixepoch', '+8 hours')";
  const [totalResult, dailyResult, bucketFunnelResult, eventResult, modeResult, transitionResult, versionResult, roomResult] = await Promise.all([
    database.prepare(
      `WITH window_visitors AS (
         SELECT visitor_hash
         FROM product_analytics_events
         WHERE received_at >= ?1 AND received_at < ?3 AND environment = ?2
         GROUP BY visitor_hash
       ), first_seen AS (
         SELECT visitor_hash, MIN(received_at) AS first_received_at
         FROM product_analytics_events
         WHERE environment = ?2
         GROUP BY visitor_hash
       )
       SELECT COUNT(*) AS activeVisitors,
              SUM(CASE WHEN f.first_received_at < ?1 THEN 1 ELSE 0 END) AS returningVisitors,
              (SELECT COUNT(DISTINCT session_hash)
               FROM product_analytics_events
               WHERE received_at >= ?1 AND received_at < ?3 AND environment = ?2) AS sessions,
              (SELECT COUNT(*) FROM (
                 SELECT visitor_hash
                 FROM product_analytics_events
                 WHERE received_at >= ?1 AND received_at < ?3 AND environment = ?2
                   AND mode IN ('nba82', 'nba5', 'online')
                 GROUP BY visitor_hash
                 HAVING COUNT(DISTINCT mode) > 1
               )) AS crossModeVisitors
       FROM window_visitors w
       JOIN first_seen f ON f.visitor_hash = w.visitor_hash`,
    ).bind(cutoff, environment, endExclusive).all(),
    database.prepare(
      `WITH bucket_visitors AS (
         SELECT ${bucketExpression} AS day, visitor_hash
         FROM product_analytics_events
         WHERE received_at >= ?1 AND received_at < ?3 AND environment = ?2
         GROUP BY day, visitor_hash
       ), first_seen AS (
         SELECT visitor_hash, ${bucketExpression.replaceAll("received_at", "MIN(received_at)")} AS first_day
         FROM product_analytics_events
         WHERE environment = ?2
         GROUP BY visitor_hash
       ), bucket_sessions AS (
         SELECT ${bucketExpression} AS day,
                COUNT(DISTINCT session_hash) AS sessions
         FROM product_analytics_events
         WHERE received_at >= ?1 AND received_at < ?3 AND environment = ?2
         GROUP BY day
       )
       SELECT d.day, COUNT(*) AS activeVisitors,
              SUM(CASE WHEN f.first_day < d.day THEN 1 ELSE 0 END) AS returningVisitors,
              COALESCE(s.sessions, 0) AS sessions
       FROM bucket_visitors d
       JOIN first_seen f ON f.visitor_hash = d.visitor_hash
       LEFT JOIN bucket_sessions s ON s.day = d.day
       GROUP BY d.day
       ORDER BY d.day`,
    ).bind(cutoff, environment, endExclusive).all(),
    database.prepare(
      `SELECT ${bucketExpression} AS day,
              COUNT(DISTINCT CASE
                WHEN event_name = 'mode_entered' AND mode = 'nba82' THEN visitor_hash
              END) AS nba82Entrants,
              COUNT(DISTINCT CASE
                WHEN event_name = 'nba82_started' THEN visitor_hash
              END) AS nba82Starters,
              COUNT(DISTINCT CASE
                WHEN event_name = 'nba82_completed' THEN visitor_hash
              END) AS nba82Completers,
              COUNT(DISTINCT CASE
                WHEN event_name = 'mode_entered' AND mode = 'nba5' THEN visitor_hash
              END) AS nba5Entrants,
              COUNT(DISTINCT CASE
                WHEN event_name = 'nba5_started' THEN visitor_hash
              END) AS nba5Starters,
              COUNT(DISTINCT CASE
                WHEN event_name = 'nba5_completed' THEN visitor_hash
              END) AS nba5Completers,
              COUNT(DISTINCT CASE
                WHEN event_name = 'mode_entered' AND mode = 'online' THEN visitor_hash
              END) AS onlineEntrants,
              COUNT(DISTINCT CASE
                WHEN event_name = 'room_started' THEN visitor_hash
              END) AS onlineStarters,
              COUNT(DISTINCT CASE
                WHEN event_name = 'pack_opened' THEN visitor_hash
              END) AS packOpeners,
              COUNT(DISTINCT CASE
                WHEN event_name = 'lineup_completed' THEN visitor_hash
              END) AS lineupCompleters,
              COUNT(DISTINCT CASE
                WHEN event_name = 'result_shared' THEN visitor_hash
              END) AS sharers
       FROM product_analytics_events
       WHERE received_at >= ?1 AND received_at < ?3 AND environment = ?2
       GROUP BY day
       ORDER BY day`,
    ).bind(cutoff, environment, endExclusive).all(),
    database.prepare(
      `SELECT event_name AS eventName,
              COUNT(*) AS events,
              COUNT(DISTINCT visitor_hash) AS visitors
       FROM product_analytics_events
       WHERE received_at >= ?1 AND received_at < ?3 AND environment = ?2
       GROUP BY event_name
       ORDER BY event_name`,
    ).bind(cutoff, environment, endExclusive).all(),
    database.prepare(
      `SELECT mode,
              COUNT(DISTINCT visitor_hash) AS visitors,
              COUNT(DISTINCT session_hash) AS sessions,
              COUNT(DISTINCT CASE
                WHEN event_name IN ('nba82_started', 'nba5_started', 'room_started') THEN visitor_hash
              END) AS starters,
              COUNT(DISTINCT CASE
                WHEN event_name IN ('nba82_completed', 'nba5_completed') THEN visitor_hash
              END) AS completers
       FROM product_analytics_events
       WHERE received_at >= ?1 AND received_at < ?3 AND environment = ?2
         AND mode IN ('nba82', 'nba5', 'online')
       GROUP BY mode
       ORDER BY visitors DESC, mode`,
    ).bind(cutoff, environment, endExclusive).all(),
    database.prepare(
      `WITH entered AS (
         SELECT visitor_hash,
                mode AS from_mode,
                LEAD(mode) OVER (
                  PARTITION BY visitor_hash
                  ORDER BY occurred_at, received_at, event_id
                ) AS to_mode
         FROM product_analytics_events
         WHERE received_at >= ?1 AND received_at < ?3 AND environment = ?2
           AND event_name = 'mode_entered'
           AND mode IN ('nba82', 'nba5', 'online')
       )
       SELECT from_mode AS fromMode,
              to_mode AS toMode,
              COUNT(*) AS transitions,
              COUNT(DISTINCT visitor_hash) AS visitors
       FROM entered
       WHERE to_mode IS NOT NULL AND from_mode <> to_mode
       GROUP BY from_mode, to_mode
       ORDER BY visitors DESC, transitions DESC, from_mode, to_mode`,
    ).bind(cutoff, environment, endExclusive).all(),
    database.prepare(
      `SELECT release_version AS releaseVersion,
              COUNT(DISTINCT visitor_hash) AS visitors,
              COUNT(*) AS events
       FROM product_analytics_events
       WHERE received_at >= ?1 AND received_at < ?3 AND environment = ?2
       GROUP BY release_version
       ORDER BY visitors DESC, release_version
       LIMIT 12`,
    ).bind(cutoff, environment, endExclusive).all(),
    database.prepare(
      `SELECT date(created_at, 'unixepoch', '+8 hours') AS day,
              COUNT(*) AS roomsCreated,
              SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS roomsComplete
       FROM battle_rooms_v3
       WHERE created_at >= ?1 AND created_at < ?2
       GROUP BY day
       ORDER BY day`,
    ).bind(cutoff, endExclusive).all(),
  ]);

  const bucketFunnelFields = [
    "nba82Entrants", "nba82Starters", "nba82Completers",
    "nba5Entrants", "nba5Starters", "nba5Completers",
    "onlineEntrants", "onlineStarters",
    "packOpeners", "lineupCompleters", "sharers",
  ];
  const bucketFunnelByDay = new Map(rowsFrom(bucketFunnelResult).map((row) => [
    row.day,
    numberFields(row, bucketFunnelFields),
  ]));

  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generatedAt: new Date(nowSeconds * 1_000).toISOString(),
    windowKey: windowKey || `${days}d`,
    windowHours,
    bucketUnit,
    environment,
    range: hasCustomRange ? {
      from: rangeFrom,
      to: rangeTo,
      startAt: new Date(cutoff * 1_000).toISOString(),
      endAtExclusive: new Date(endExclusive * 1_000).toISOString(),
    } : null,
    totals: numberFields(rowsFrom(totalResult)[0] || {}, [
      "activeVisitors", "returningVisitors", "sessions", "crossModeVisitors",
    ]),
    daily: rowsFrom(dailyResult).map((row) => ({
      ...numberFields(row, ["activeVisitors", "returningVisitors", "sessions"]),
      ...numberFields(bucketFunnelByDay.get(row.day), bucketFunnelFields),
    })),
    events: rowsFrom(eventResult).map((row) => numberFields(row, ["events", "visitors"])),
    modes: rowsFrom(modeResult).map((row) => numberFields(row, [
      "visitors", "sessions", "starters", "completers",
    ])),
    transitions: rowsFrom(transitionResult).map((row) => numberFields(row, [
      "transitions", "visitors",
    ])),
    versions: rowsFrom(versionResult).map((row) => numberFields(row, ["visitors", "events"])),
    legacyRooms: rowsFrom(roomResult).map((row) => numberFields(row, [
      "roomsCreated", "roomsComplete",
    ])),
  };
}

export function scheduleAnalyticsCleanup(context, database, nowSeconds, env, random = Math.random) {
  if (!context || typeof context.waitUntil !== "function" || random() >= 0.01) return;
  const retentionDays = positiveInteger(env?.ANALYTICS_RETENTION_DAYS, 90, { min: 30, max: 365 });
  const eventCutoff = nowSeconds - retentionDays * 86_400;
  const rateLimitCutoff = nowSeconds - 172_800;
  context.waitUntil(Promise.all([
    database.prepare("DELETE FROM product_analytics_events WHERE received_at < ?1")
      .bind(eventCutoff).run(),
    database.prepare("DELETE FROM product_analytics_rate_limits WHERE window_start < ?1")
      .bind(rateLimitCutoff).run(),
  ]).catch((error) => console.error("Product analytics cleanup failed", error)));
}
