import { ApiError } from "./errors.mjs";
import {
  BATTLE_ROOM_CODE_PATTERN,
  BATTLE_ROOM_TTL_SECONDS,
  normalizeRoomCode,
} from "./battle-rooms-validation.mjs";
import { sha256Hex } from "./security.mjs";

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
  const complete = !expired && row.status === "complete";
  return {
    code: row.room_code,
    status: expired ? "expired" : row.status,
    roomType: row.room_type,
    round: Number(row.round_number || 1),
    score: {
      host: Number(row.host_score || 0),
      guest: Number(row.guest_score || 0),
      scoredRound: Number(row.scored_round || 0),
      lastWinner: /^(host|guest)$/.test(String(row.round_winner || ""))
        ? row.round_winner
        : null,
    },
    protocolVersion: row.protocol_version,
    host: {
      name: row.host_name,
      ready: Boolean(row.host_lineup_code),
      packsOpened: Number(row.host_pack_count || 0),
      rematch: row.host_rematch_mode || null,
      lineupCode: complete ? row.host_lineup_code : null,
    },
    guest: row.guest_name ? {
      name: row.guest_name,
      ready: Boolean(row.guest_lineup_code),
      packsOpened: Number(row.guest_pack_count || 0),
      rematch: row.guest_rematch_mode || null,
      lineupCode: complete ? row.guest_lineup_code : null,
    } : null,
    seed: complete ? row.match_seed : null,
    createdAt: iso(row.created_at),
    joinedAt: row.joined_at ? iso(row.joined_at) : null,
    startedAt: complete ? iso(row.started_at) : null,
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
    const sessionToken = randomToken(ROOM_ALPHABET, 32);
    const tokenHash = await sha256Hex(sessionToken);
    if (!BATTLE_ROOM_CODE_PATTERN.test(roomCode)) continue;
    try {
      const row = await database.prepare(
        `INSERT INTO battle_rooms_v3 (
          room_code, status, room_type, host_name, host_token_hash, protocol_version,
          created_at, expires_at
        ) VALUES (?1, 'waiting_guest', ?2, ?3, ?4, ?5, ?6, ?7)
        RETURNING *`,
      ).bind(
        roomCode,
        submission.roomType,
        submission.name,
        tokenHash,
        submission.protocolVersion,
        nowSeconds,
        expiresAt,
      ).first();
      return { room: publicRoom(row, nowSeconds), sessionToken };
    } catch (error) {
      if (!/unique|constraint/i.test(String(error?.message || error))) throw error;
    }
  }
  throw new ApiError(503, "room_code_unavailable", "暂时无法生成房间码，请重试。");
}

export async function getBattleRoom(database, code, nowSeconds) {
  const roomCode = normalizeRoomCode(code);
  const row = await database.prepare(
    "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
  ).bind(roomCode).first();
  return publicRoom(row, nowSeconds);
}

export async function joinBattleRoom(database, code, submission, nowSeconds) {
  const roomCode = normalizeRoomCode(code);
  const sessionToken = randomToken(ROOM_ALPHABET, 32);
  const tokenHash = await sha256Hex(sessionToken);
  const updated = await database.prepare(
    `UPDATE battle_rooms_v3 SET
      status = 'selecting',
      guest_name = ?1,
      guest_token_hash = ?2,
      joined_at = ?3,
      expires_at = ?4
    WHERE room_code = ?5
      AND status = 'waiting_guest'
      AND expires_at > ?3
      AND protocol_version = ?6
    RETURNING *`,
  ).bind(
    submission.name,
    tokenHash,
    nowSeconds,
    nowSeconds + BATTLE_ROOM_TTL_SECONDS,
    roomCode,
    submission.protocolVersion,
  ).first();
  if (updated) return { room: publicRoom(updated, nowSeconds), sessionToken };

  const existing = await database.prepare(
    "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
  ).bind(roomCode).first();
  if (!existing) throw new ApiError(404, "room_not_found", "没有找到这个房间。");
  if (Number(existing.expires_at) <= nowSeconds) {
    throw new ApiError(410, "room_expired", "这个房间已经过期，请重新创建。");
  }
  if (existing.protocol_version !== submission.protocolVersion) {
    throw new ApiError(409, "protocol_mismatch", "房间版本不一致，请刷新后重新创建。");
  }
  throw new ApiError(409, "room_already_joined", "这个房间已经有挑战者了。");
}

async function roomWithSession(database, code, sessionToken, nowSeconds) {
  const roomCode = normalizeRoomCode(code);
  const row = await database.prepare(
    "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
  ).bind(roomCode).first();
  if (!row) throw new ApiError(404, "room_not_found", "没有找到这个房间。");
  if (Number(row.expires_at) <= nowSeconds) {
    throw new ApiError(410, "room_expired", "这个房间已经过期，请重新创建。");
  }
  const tokenHash = await sha256Hex(sessionToken);
  const role = tokenHash === row.host_token_hash
    ? "host"
    : tokenHash === row.guest_token_hash
      ? "guest"
      : null;
  if (!role) throw new ApiError(401, "invalid_room_session", "房间身份已经失效，请重新进入房间。");
  return { roomCode, row, role, tokenHash };
}

export async function submitBattleRoomLineup(database, code, submission, nowSeconds) {
  const session = await roomWithSession(database, code, submission.sessionToken, nowSeconds);
  if (session.row.status === "complete") {
    const locked = session.role === "host"
      ? session.row.host_lineup_code
      : session.row.guest_lineup_code;
    if (locked === submission.lineupCode) return publicRoom(session.row, nowSeconds);
    throw new ApiError(409, "lineup_locked", "阵容已经锁定，不能再次修改。");
  }
  const ownColumn = session.role === "host" ? "host_lineup_code" : "guest_lineup_code";
  const readyColumn = session.role === "host" ? "host_ready_at" : "guest_ready_at";
  const otherColumn = session.role === "host" ? "guest_lineup_code" : "host_lineup_code";
  const packColumn = session.role === "host" ? "host_pack_count" : "guest_pack_count";
  if (session.row.room_type === "fair_pack" && Number(session.row[packColumn] || 0) < 1) {
    throw new ApiError(409, "pack_required", "请先打开至少一包候选卡。");
  }
  const seed = randomSeed();
  const updated = await database.prepare(
    `UPDATE battle_rooms_v3 SET
      ${ownColumn} = ?1,
      ${readyColumn} = ?2,
      status = CASE
        WHEN guest_name IS NOT NULL AND ${otherColumn} IS NOT NULL THEN 'complete'
        WHEN guest_name IS NULL THEN 'waiting_guest'
        ELSE 'selecting'
      END,
      match_seed = CASE
        WHEN guest_name IS NOT NULL AND ${otherColumn} IS NOT NULL THEN ?3
        ELSE match_seed
      END,
      started_at = CASE
        WHEN guest_name IS NOT NULL AND ${otherColumn} IS NOT NULL THEN ?2
        ELSE started_at
      END,
      expires_at = ?4
    WHERE room_code = ?5
      AND status IN ('waiting_guest', 'selecting')
      AND ${ownColumn} IS NULL
    RETURNING *`,
  ).bind(
    submission.lineupCode,
    nowSeconds,
    seed,
    nowSeconds + BATTLE_ROOM_TTL_SECONDS,
    session.roomCode,
  ).first();
  if (updated) return publicRoom(updated, nowSeconds);
  const latest = await database.prepare(
    "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
  ).bind(session.roomCode).first();
  const locked = session.role === "host" ? latest?.host_lineup_code : latest?.guest_lineup_code;
  if (locked === submission.lineupCode) return publicRoom(latest, nowSeconds);
  throw new ApiError(409, "lineup_locked", "阵容已经锁定，不能再次修改。");
}

export async function startBattleRoom(database, code, submission, nowSeconds) {
  const session = await roomWithSession(database, code, submission.sessionToken, nowSeconds);
  if (session.row.status === "complete") {
    const updated = await database.prepare(
      "UPDATE battle_rooms_v3 SET expires_at = ?1 WHERE room_code = ?2 RETURNING *",
    ).bind(nowSeconds + BATTLE_ROOM_TTL_SECONDS, session.roomCode).first();
    return publicRoom(updated || session.row, nowSeconds);
  }
  throw new ApiError(409, "result_not_ready", "双方锁定阵容后才能查看结果。");
}

export async function consumeBattleRoomPack(database, code, submission, nowSeconds) {
  const session = await roomWithSession(database, code, submission.sessionToken, nowSeconds);
  const ownColumn = session.role === "host" ? "host_pack_count" : "guest_pack_count";
  const lineupColumn = session.role === "host" ? "host_lineup_code" : "guest_lineup_code";
  const updated = await database.prepare(
    `UPDATE battle_rooms_v3 SET
      ${ownColumn} = ${ownColumn} + 1,
      expires_at = ?1
    WHERE room_code = ?2
      AND status IN ('waiting_guest', 'selecting')
      AND ${lineupColumn} IS NULL
      AND (room_type = 'open_lineup' OR ${ownColumn} < 3)
    RETURNING *`,
  ).bind(nowSeconds + BATTLE_ROOM_TTL_SECONDS, session.roomCode).first();
  if (!updated) {
    if (session.row[lineupColumn]) {
      throw new ApiError(409, "lineup_locked", "阵容已经锁定，不能继续换包。");
    }
    if (session.row.room_type === "fair_pack") {
      throw new ApiError(409, "pack_limit_reached", "本房间最多只能打开三包。");
    }
    throw new ApiError(409, "pack_unavailable", "当前房间暂时不能继续换包。");
  }
  return {
    room: publicRoom(updated, nowSeconds),
    packCount: Number(updated[ownColumn]),
  };
}

export async function requestBattleRoomRematch(database, code, submission, nowSeconds) {
  const session = await roomWithSession(database, code, submission.sessionToken, nowSeconds);
  if (session.row.status !== "complete") {
    throw new ApiError(409, "series_not_complete", "本轮系列赛尚未完成。");
  }
  if (Number(session.row.scored_round || 0) < Number(session.row.round_number || 1)) {
    throw new ApiError(409, "series_score_pending", "本轮结果正在记分，请稍后再试。");
  }
  const ownColumn = session.role === "host" ? "host_rematch_mode" : "guest_rematch_mode";
  await database.prepare(
    `UPDATE battle_rooms_v3 SET ${ownColumn} = ?1, expires_at = ?2
    WHERE room_code = ?3 AND status = 'complete'
    RETURNING room_code`,
  ).bind(submission.mode, nowSeconds + BATTLE_ROOM_TTL_SECONDS, session.roomCode).first();
  const proposed = await database.prepare(
    "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
  ).bind(session.roomCode).first();
  if (!proposed?.host_rematch_mode || !proposed?.guest_rematch_mode) {
    return publicRoom(proposed, nowSeconds);
  }
  const hostRedraft = proposed.host_rematch_mode === "redraft";
  const guestRedraft = proposed.guest_rematch_mode === "redraft";
  const anyRedraft = hostRedraft || guestRedraft;
  const seed = randomSeed();
  const updated = await database.prepare(
    `UPDATE battle_rooms_v3 SET
      round_number = round_number + 1,
      status = ?1,
      host_lineup_code = CASE WHEN ?2 = 1 THEN NULL ELSE host_lineup_code END,
      guest_lineup_code = CASE WHEN ?3 = 1 THEN NULL ELSE guest_lineup_code END,
      host_ready_at = CASE WHEN ?2 = 1 THEN NULL ELSE host_ready_at END,
      guest_ready_at = CASE WHEN ?3 = 1 THEN NULL ELSE guest_ready_at END,
      host_pack_count = CASE WHEN ?2 = 1 THEN 0 ELSE host_pack_count END,
      guest_pack_count = CASE WHEN ?3 = 1 THEN 0 ELSE guest_pack_count END,
      match_seed = CASE WHEN ?4 = 1 THEN NULL ELSE ?5 END,
      started_at = CASE WHEN ?4 = 1 THEN NULL ELSE ?6 END,
      host_rematch_mode = NULL,
      guest_rematch_mode = NULL,
      expires_at = ?7
    WHERE room_code = ?8
      AND status = 'complete'
      AND round_number = ?9
      AND host_rematch_mode IS NOT NULL
      AND guest_rematch_mode IS NOT NULL
    RETURNING *`,
  ).bind(
    anyRedraft ? "selecting" : "complete",
    hostRedraft ? 1 : 0,
    guestRedraft ? 1 : 0,
    anyRedraft ? 1 : 0,
    seed,
    nowSeconds,
    nowSeconds + BATTLE_ROOM_TTL_SECONDS,
    session.roomCode,
    Number(proposed.round_number),
  ).first();
  if (updated) return publicRoom(updated, nowSeconds);
  const latest = await database.prepare(
    "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
  ).bind(session.roomCode).first();
  return publicRoom(latest, nowSeconds);
}

export async function scoreBattleRoomRound(database, code, submission, nowSeconds) {
  const session = await roomWithSession(database, code, submission.sessionToken, nowSeconds);
  if (session.row.status !== "complete") {
    throw new ApiError(409, "series_not_complete", "本轮系列赛尚未完成。");
  }
  const currentRound = Number(session.row.round_number || 1);
  if (submission.round !== currentRound) {
    throw new ApiError(409, "score_round_mismatch", "记分轮次与当前房间不一致，请刷新后重试。");
  }
  const previousScoredRound = Number(session.row.scored_round || 0);
  if (previousScoredRound === currentRound) {
    if (session.row.round_winner === submission.winner) {
      return publicRoom(session.row, nowSeconds);
    }
    throw new ApiError(409, "score_winner_conflict", "本轮胜方已经锁定，不能重复修改。");
  }
  if (previousScoredRound > currentRound) {
    throw new ApiError(409, "score_round_conflict", "房间记分状态异常，请重新进入房间。");
  }
  const scoreColumn = submission.winner === "host" ? "host_score" : "guest_score";
  const updated = await database.prepare(
    `UPDATE battle_rooms_v3 SET
      ${scoreColumn} = ${scoreColumn} + 1,
      scored_round = ?1,
      round_winner = ?2,
      expires_at = ?3
    WHERE room_code = ?4
      AND status = 'complete'
      AND round_number = ?1
      AND scored_round < ?1
      AND expires_at > ?5
    RETURNING *`,
  ).bind(
    currentRound,
    submission.winner,
    nowSeconds + BATTLE_ROOM_TTL_SECONDS,
    session.roomCode,
    nowSeconds,
  ).first();
  if (updated) return publicRoom(updated, nowSeconds);

  const latest = await database.prepare(
    "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
  ).bind(session.roomCode).first();
  if (Number(latest?.scored_round || 0) === currentRound) {
    if (latest.round_winner === submission.winner) return publicRoom(latest, nowSeconds);
    throw new ApiError(409, "score_winner_conflict", "本轮胜方已经锁定，不能重复修改。");
  }
  throw new ApiError(409, "score_round_conflict", "本轮记分未完成，请刷新后重试。");
}

export function scheduleBattleRoomCleanup(context, database, nowSeconds) {
  if (!context || typeof context.waitUntil !== "function" || Math.random() >= 0.05) return;
  const rateLimitCutoff = nowSeconds - 2 * 24 * 60 * 60;
  const roomCutoff = nowSeconds;
  context.waitUntil(database.batch([
    database.prepare("DELETE FROM battle_rooms WHERE expires_at < ?1").bind(roomCutoff),
    database.prepare("DELETE FROM battle_rooms_v2 WHERE expires_at < ?1").bind(roomCutoff),
    database.prepare("DELETE FROM battle_rooms_v3 WHERE expires_at < ?1").bind(roomCutoff),
    database.prepare("DELETE FROM battle_room_rate_limits WHERE window_start < ?1")
      .bind(rateLimitCutoff),
  ]).catch(error => console.error("Battle room cleanup failed", error)));
}
