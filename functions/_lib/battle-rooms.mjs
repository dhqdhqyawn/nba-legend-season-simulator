import { ApiError } from "./errors.mjs";
import {
  BATTLE_ROOM_CODE_PATTERN,
  BATTLE_ROOM_TTL_SECONDS,
  normalizeRoomCode,
} from "./battle-rooms-validation.mjs";

const ROOM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomToken(alphabet, length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

function randomSeed() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function iso(seconds) {
  return new Date(Number(seconds) * 1000).toISOString();
}

export function publicRoom(row, nowSeconds) {
  if (!row) throw new ApiError(404, "room_not_found", "没有找到这个房间。");
  const expired = Number(row.expires_at) <= nowSeconds;
  const ready = !expired && row.status === "ready";
  return {
    code: row.room_code,
    status: expired ? "expired" : ready ? "ready" : "waiting",
    protocolVersion: row.protocol_version,
    host: {
      name: row.host_name,
      lineupCode: row.host_lineup_code,
    },
    guest: ready ? {
      name: row.guest_name,
      lineupCode: row.guest_lineup_code,
    } : null,
    seed: ready ? row.match_seed : null,
    createdAt: iso(row.created_at),
    joinedAt: ready ? iso(row.joined_at) : null,
    expiresAt: iso(row.expires_at),
  };
}

export async function enforceBattleRoomRateLimit(database, clientHash, action, nowSeconds, env) {
  const windowSeconds = 60 * 60;
  const defaults = action === "create" ? 12 : 30;
  const configured = Number.parseInt(String(
    action === "create" ? env?.BATTLE_ROOM_CREATE_LIMIT : env?.BATTLE_ROOM_JOIN_LIMIT,
  ), 10);
  const maxRequests = Number.isSafeInteger(configured) && configured >= 1 && configured <= 200
    ? configured
    : defaults;
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const row = await database.prepare(
    `INSERT INTO battle_room_rate_limits (
      client_hash, action, window_start, request_count, last_seen_at
    ) VALUES (?1, ?2, ?3, 1, ?4)
    ON CONFLICT(client_hash, action, window_start) DO UPDATE SET
      request_count = request_count + 1,
      last_seen_at = excluded.last_seen_at
    RETURNING request_count`,
  ).bind(clientHash, action, windowStart, nowSeconds).first();
  if (Number(row?.request_count || 0) > maxRequests) {
    throw new ApiError(429, "rate_limited", "操作过于频繁，请稍后再试。", {
      "Retry-After": String(Math.max(1, windowStart + windowSeconds - nowSeconds)),
    });
  }
}

export async function createBattleRoom(database, submission, nowSeconds) {
  const expiresAt = nowSeconds + BATTLE_ROOM_TTL_SECONDS;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const roomCode = randomToken(ROOM_ALPHABET, 8);
    if (!BATTLE_ROOM_CODE_PATTERN.test(roomCode)) continue;
    try {
      const row = await database.prepare(
        `INSERT INTO battle_rooms (
          room_code, status, host_name, host_lineup_code, protocol_version,
          created_at, expires_at
        ) VALUES (?1, 'waiting', ?2, ?3, ?4, ?5, ?6)
        RETURNING *`,
      ).bind(
        roomCode,
        submission.name,
        submission.lineupCode,
        submission.protocolVersion,
        nowSeconds,
        expiresAt,
      ).first();
      return publicRoom(row, nowSeconds);
    } catch (error) {
      if (!/unique|constraint/i.test(String(error?.message || error))) throw error;
    }
  }
  throw new ApiError(503, "room_code_unavailable", "暂时无法生成房间码，请重试。");
}

export async function getBattleRoom(database, code, nowSeconds) {
  const roomCode = normalizeRoomCode(code);
  const row = await database.prepare(
    "SELECT * FROM battle_rooms WHERE room_code = ?1",
  ).bind(roomCode).first();
  return publicRoom(row, nowSeconds);
}

export async function joinBattleRoom(database, code, submission, nowSeconds) {
  const roomCode = normalizeRoomCode(code);
  const seed = randomSeed();
  const updated = await database.prepare(
    `UPDATE battle_rooms SET
      status = 'ready',
      guest_name = ?1,
      guest_lineup_code = ?2,
      match_seed = ?3,
      joined_at = ?4
    WHERE room_code = ?5
      AND status = 'waiting'
      AND expires_at > ?4
      AND protocol_version = ?6
    RETURNING *`,
  ).bind(
    submission.name,
    submission.lineupCode,
    seed,
    nowSeconds,
    roomCode,
    submission.protocolVersion,
  ).first();
  if (updated) return publicRoom(updated, nowSeconds);

  const existing = await database.prepare(
    "SELECT * FROM battle_rooms WHERE room_code = ?1",
  ).bind(roomCode).first();
  if (!existing) throw new ApiError(404, "room_not_found", "没有找到这个房间。");
  if (Number(existing.expires_at) <= nowSeconds) {
    throw new ApiError(410, "room_expired", "这个房间已经过期，请重新创建。");
  }
  if (existing.protocol_version !== submission.protocolVersion) {
    throw new ApiError(409, "protocol_mismatch", "房间版本不一致，请刷新后重新创建。");
  }
  if (
    existing.status === "ready"
    && existing.guest_name === submission.name
    && existing.guest_lineup_code === submission.lineupCode
  ) {
    return publicRoom(existing, nowSeconds);
  }
  throw new ApiError(409, "room_already_joined", "这个房间已经有挑战者了。");
}

export function scheduleBattleRoomCleanup(context, database, nowSeconds) {
  if (!context || typeof context.waitUntil !== "function" || Math.random() >= 0.05) return;
  const rateLimitCutoff = nowSeconds - 2 * 24 * 60 * 60;
  const roomCutoff = nowSeconds - 7 * 24 * 60 * 60;
  context.waitUntil(database.batch([
    database.prepare("DELETE FROM battle_rooms WHERE expires_at < ?1").bind(roomCutoff),
    database.prepare("DELETE FROM battle_room_rate_limits WHERE window_start < ?1")
      .bind(rateLimitCutoff),
  ]).catch(error => console.error("Battle room cleanup failed", error)));
}
