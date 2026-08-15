import { ApiError } from "./errors.mjs";

const EVENTS = new Set([
  "session_start", "mode_entered", "pack_opened", "lineup_completed",
  "nba5_started", "nba5_completed", "room_created", "room_joined",
  "room_started", "home_shared", "invite_shared", "result_shared",
  "reward_ad_started", "reward_ad_completed", "bonus_pack_granted",
]);
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{12,80}$/;
const MODE = /^[A-Za-z0-9_-]{1,32}$/;
const RELEASE = /^[A-Za-z0-9._-]{1,100}$/;

export function normalizeWechatMirror(payload, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!payload || !Array.isArray(payload.events) || payload.events.length < 1 || payload.events.length > 20) {
    throw new ApiError(400, "invalid_wechat_analytics_batch", "小程序统计批次无效。");
  }
  const seen = new Set();
  const rows = payload.events.map(input => {
    const id = String(input?.id || "");
    const name = String(input?.name || "");
    const visitorHash = String(input?.visitorHash || "");
    const sessionHash = String(input?.sessionHash || "");
    if (!ID.test(id) || !EVENTS.has(name) || !HASH.test(visitorHash) || !HASH.test(sessionHash) || seen.has(id)) {
      throw new ApiError(400, "invalid_wechat_analytics_event", "小程序统计事件无效。");
    }
    seen.add(id);
    const supplied = Number(input.occurredAt);
    const occurredAt = Number.isFinite(supplied) && Math.abs(supplied - nowSeconds) <= 86400 ? Math.floor(supplied) : nowSeconds;
    const mode = MODE.test(String(input.mode || "")) ? String(input.mode) : "unknown";
    const simulationType = ["quick", "coach"].includes(input.simulationType) ? input.simulationType : "unknown";
    const poolMode = ["three_pack", "full"].includes(input.poolMode) ? input.poolMode : "unknown";
    const releaseVersion = RELEASE.test(String(input.releaseVersion || "")) ? String(input.releaseVersion) : "unknown";
    return { id, name, visitorHash, sessionHash, mode, simulationType, poolMode, releaseVersion, occurredAt, receivedAt: nowSeconds };
  });
  return rows;
}

export async function persistWechatMirror(database, rows) {
  const statements = rows.map(row => database.prepare(
    `INSERT OR IGNORE INTO wechat_analytics_events (
      event_id, event_name, visitor_hash, session_hash, mode, simulation_type,
      pool_mode, release_version, occurred_at, received_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
  ).bind(row.id, row.name, row.visitorHash, row.sessionHash, row.mode,
    row.simulationType, row.poolMode, row.releaseVersion, row.occurredAt, row.receivedAt));
  const results = await database.batch(statements);
  return results.reduce((sum, result) => sum + Number(result?.meta?.changes || 0), 0);
}

export function normalizeWechatOfficial(payload, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!payload || !Array.isArray(payload.rows) || payload.rows.length > 31) throw new ApiError(400, "invalid_wechat_official_batch", "微信官方趋势批次无效。");
  return payload.rows.map(input => {
    const rawDate = String(input?.refDate || "");
    if (!/^\d{8}$/.test(rawDate)) throw new ApiError(400, "invalid_wechat_official_date", "微信官方趋势日期无效。");
    const numeric = key => Math.max(0, Number(input?.[key]) || 0);
    return { refDate: `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6)}`,
      sessionCount: numeric("sessionCnt"), visitPv: numeric("visitPv"), visitUv: numeric("visitUv"), newUv: numeric("visitUvNew"),
      stayTimeUv: numeric("stayTimeUv"), stayTimeSession: numeric("stayTimeSession"), visitDepth: numeric("visitDepth"), syncedAt: nowSeconds };
  });
}

export async function persistWechatOfficial(database, rows) {
  const statements = rows.map(row => database.prepare(`INSERT INTO wechat_official_daily (
    ref_date, session_count, visit_pv, visit_uv, new_uv, stay_time_uv, stay_time_session, visit_depth, synced_at
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(ref_date) DO UPDATE SET
    session_count=excluded.session_count, visit_pv=excluded.visit_pv, visit_uv=excluded.visit_uv,
    new_uv=excluded.new_uv, stay_time_uv=excluded.stay_time_uv, stay_time_session=excluded.stay_time_session,
    visit_depth=excluded.visit_depth, synced_at=excluded.synced_at`).bind(row.refDate,row.sessionCount,row.visitPv,row.visitUv,row.newUv,row.stayTimeUv,row.stayTimeSession,row.visitDepth,row.syncedAt));
  if (statements.length) await database.batch(statements);
  return rows.length;
}

function rowsFrom(result) { return Array.isArray(result?.results) ? result.results : []; }
function numbers(row, fields) {
  const result = { ...row };
  fields.forEach(field => { result[field] = Number(row?.[field] || 0); });
  return result;
}

export async function getWechatSummary(database, { windowHours, windowKey, nowSeconds, rangeStart, rangeEnd, rangeFrom = null, rangeTo = null, requestedBucketUnit = "auto" }) {
  const custom = Number.isFinite(rangeStart) && Number.isFinite(rangeEnd);
  const cutoff = custom ? rangeStart : nowSeconds - windowHours * 3600;
  const end = custom ? rangeEnd : nowSeconds + 1;
  const hours = custom ? Math.ceil((end - cutoff) / 3600) : windowHours;
  const bucketUnit = ["hour", "day"].includes(requestedBucketUnit) ? requestedBucketUnit : hours <= 72 ? "hour" : "day";
  const bucket = bucketUnit === "hour" ? "strftime('%Y-%m-%d %H:00', occurred_at, 'unixepoch', '+8 hours')" : "date(occurred_at, 'unixepoch', '+8 hours')";
  const [totals, daily, funnel, modes, versions, official, transitions] = await Promise.all([
    database.prepare(`SELECT COUNT(DISTINCT visitor_hash) activeVisitors, COUNT(DISTINCT session_hash) sessions
      FROM wechat_analytics_events WHERE occurred_at >= ?1 AND occurred_at < ?2`).bind(cutoff, end).all(),
    database.prepare(`SELECT ${bucket} day, COUNT(DISTINCT visitor_hash) activeVisitors,
      COUNT(DISTINCT session_hash) sessions FROM wechat_analytics_events
      WHERE occurred_at >= ?1 AND occurred_at < ?2 GROUP BY day ORDER BY day`).bind(cutoff, end).all(),
    database.prepare(`SELECT event_name eventName, COUNT(*) events, COUNT(DISTINCT visitor_hash) visitors
      FROM wechat_analytics_events WHERE occurred_at >= ?1 AND occurred_at < ?2
      GROUP BY event_name ORDER BY event_name`).bind(cutoff, end).all(),
    database.prepare(`SELECT mode, COUNT(DISTINCT visitor_hash) visitors, COUNT(DISTINCT session_hash) sessions,
      COUNT(DISTINCT CASE WHEN event_name IN ('nba5_started','room_started') THEN visitor_hash END) starters,
      COUNT(DISTINCT CASE WHEN event_name = 'nba5_completed' THEN visitor_hash END) completers
      FROM wechat_analytics_events WHERE occurred_at >= ?1 AND occurred_at < ?2 AND mode <> 'home'
      GROUP BY mode ORDER BY visitors DESC, mode`).bind(cutoff, end).all(),
    database.prepare(`SELECT release_version releaseVersion, COUNT(DISTINCT visitor_hash) visitors, COUNT(*) events
      FROM wechat_analytics_events WHERE occurred_at >= ?1 AND occurred_at < ?2
      GROUP BY release_version ORDER BY visitors DESC LIMIT 12`).bind(cutoff, end).all(),
    database.prepare(`SELECT ref_date day, session_count sessions, visit_pv visitPv, visit_uv visitUv,
      new_uv newUv, stay_time_uv stayTimeUv, stay_time_session stayTimeSession, visit_depth visitDepth, synced_at syncedAt
      FROM wechat_official_daily WHERE ref_date >= date(?1,'unixepoch','+8 hours') AND ref_date < date(?2,'unixepoch','+8 hours') ORDER BY ref_date`).bind(cutoff, end).all(),
    database.prepare(`WITH entered AS (
      SELECT visitor_hash, mode from_mode, LEAD(mode) OVER (PARTITION BY visitor_hash ORDER BY occurred_at, received_at, event_id) to_mode
      FROM wechat_analytics_events WHERE occurred_at >= ?1 AND occurred_at < ?2 AND event_name='mode_entered' AND mode <> 'home'
    ) SELECT from_mode fromMode, to_mode toMode, COUNT(*) transitions, COUNT(DISTINCT visitor_hash) visitors
      FROM entered WHERE to_mode IS NOT NULL AND from_mode <> to_mode GROUP BY from_mode,to_mode ORDER BY visitors DESC,transitions DESC`).bind(cutoff, end).all(),
  ]);
  const eventRows = rowsFrom(funnel).map(row => numbers(row, ["events", "visitors"]));
  const eventMap = new Map(eventRows.map(row => [row.eventName, row]));
  const dailyBase = rowsFrom(daily).map(row => numbers(row, ["activeVisitors", "sessions"]));
  const dailyFunnel = await database.prepare(`SELECT ${bucket} day,
    COUNT(DISTINCT CASE WHEN event_name='pack_opened' THEN visitor_hash END) packOpeners,
    COUNT(DISTINCT CASE WHEN event_name='lineup_completed' THEN visitor_hash END) lineupCompleters,
    COUNT(DISTINCT CASE WHEN event_name='nba5_started' THEN visitor_hash END) nba5Starters,
    COUNT(DISTINCT CASE WHEN event_name='nba5_completed' THEN visitor_hash END) nba5Completers,
    COUNT(DISTINCT CASE WHEN event_name='room_started' THEN visitor_hash END) onlineStarters,
    COUNT(DISTINCT CASE WHEN event_name IN ('home_shared','invite_shared','result_shared') THEN visitor_hash END) sharers
    FROM wechat_analytics_events WHERE occurred_at >= ?1 AND occurred_at < ?2 GROUP BY day ORDER BY day`).bind(cutoff, end).all();
  const byDay = new Map(rowsFrom(dailyFunnel).map(row => [row.day, numbers(row, ["packOpeners", "lineupCompleters", "nba5Starters", "nba5Completers", "onlineStarters", "sharers"])]));
  return {
    schemaVersion: "wechat-product-analytics-1.0.0", platform: "wechat_mini",
    generatedAt: new Date(nowSeconds * 1000).toISOString(), windowKey, windowHours: hours, bucketUnit,
    range: custom ? { from: rangeFrom, to: rangeTo } : null,
    totals: { ...numbers(rowsFrom(totals)[0], ["activeVisitors", "sessions"]), returningVisitors: 0, crossModeVisitors: 0 },
    daily: dailyBase.map(row => ({ ...row, returningVisitors: 0, ...(byDay.get(row.day) || {}) })),
    events: eventRows, modes: rowsFrom(modes).map(row => numbers(row, ["visitors", "sessions", "starters", "completers"])),
    transitions: rowsFrom(transitions).map(row => numbers(row, ["transitions", "visitors"])), versions: rowsFrom(versions).map(row => numbers(row, ["visitors", "events"])), legacyRooms: [],
    official: rowsFrom(official).map(row => numbers(row, ["sessions","visitPv","visitUv","newUv","stayTimeUv","stayTimeSession","visitDepth","syncedAt"])),
  };
}
