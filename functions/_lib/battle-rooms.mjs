import { ApiError } from "./errors.mjs";
import {
  BATTLE_ROOM_CODE_PATTERN,
  BATTLE_ROOM_STRATEGY_PROTOCOL,
  BATTLE_ROOM_TTL_SECONDS,
  battleRoomTtlSeconds,
  normalizeRoomCode,
} from "./battle-rooms-validation.mjs";
import { BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION } from "./battle-room-strategy-validation.mjs";
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

export function strategyRoomCardSeasonYear(card) {
  const match = String(card?.version || card?.displayVersion || "").match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

export function strategyRoomCardPoolKey(card) {
  const year = strategyRoomCardSeasonYear(card);
  if (!Number.isInteger(year)) {
    throw new ApiError(500, "strategy_card_season_missing", "逐场卡片缺少可识别的赛季。");
  }
  return year >= 2015 ? "modern_2015_2026" : "historic_pre_2015";
}

async function assertCanonicalStrategyRoomLineup(lineupCode, cardPoolKey = "all") {
  let decodeStrategyRoomLineup;
  try {
    ({ decodeStrategyRoomLineup } = await import("./nba5-strategy-room-settler.mjs"));
  } catch (error) {
    console.error("NBA5 strategy room catalog failed to load", error);
    throw new ApiError(503, "strategy_catalog_unavailable", "逐场阵容目录暂时不可用，请稍后重试。");
  }
  let lineup;
  try {
    lineup = decodeStrategyRoomLineup(lineupCode);
  } catch {
    throw new ApiError(400, "invalid_strategy_lineup", "阵容码不属于当前逐场策略卡池或位置不合法。");
  }
  const outsidePool = cardPoolKey === "all"
    ? false
    : lineup.some(card => strategyRoomCardPoolKey(card) !== cardPoolKey);
  if (outsidePool) {
    throw new ApiError(400, "lineup_outside_card_pool", "阵容中包含不属于本轮卡池的球员卡。");
  }
}

function iso(seconds) {
  return new Date(Number(seconds) * 1000).toISOString();
}

export function publicRoom(row, nowSeconds) {
  if (!row) throw new ApiError(404, "room_not_found", "没有找到这个房间。");
  const expired = Number(row.expires_at) <= nowSeconds;
  const strategyRoom = row.protocol_version === BATTLE_ROOM_STRATEGY_PROTOCOL;
  const complete = !expired && row.status === "complete" && !strategyRoom;
  return {
    code: row.room_code,
    status: expired
      ? "expired"
      : strategyRoom && row.status === "complete"
        ? "lineups_locked"
        : row.status,
    roomType: row.room_type,
    cardPoolKey: row.card_pool_key || "all",
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
    ...(strategyRoom ? { battleMode: "coach" } : {}),
    host: {
      name: row.host_name,
      ready: Boolean(row.host_lineup_code),
      packsOpened: Number(row.host_pack_count || 0),
      ...(strategyRoom
        ? { rematchReady: Boolean(row.host_rematch_mode) }
        : { rematch: row.host_rematch_mode || null }),
      lineupCode: complete ? row.host_lineup_code : null,
    },
    guest: row.guest_name ? {
      name: row.guest_name,
      ready: Boolean(row.guest_lineup_code),
      packsOpened: Number(row.guest_pack_count || 0),
      ...(strategyRoom
        ? { rematchReady: Boolean(row.guest_rematch_mode) }
        : { rematch: row.guest_rematch_mode || null }),
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
  const expiresAt = nowSeconds + battleRoomTtlSeconds(submission.protocolVersion);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const roomCode = randomToken(ROOM_ALPHABET, 8);
    const sessionToken = randomToken(ROOM_ALPHABET, 32);
    const tokenHash = await sha256Hex(sessionToken);
    if (!BATTLE_ROOM_CODE_PATTERN.test(roomCode)) continue;
    try {
      const row = await database.prepare(
        `INSERT INTO battle_rooms_v3 (
          room_code, status, room_type, card_pool_key, host_name, host_token_hash,
          protocol_version, created_at, expires_at
        ) VALUES (?1, 'waiting_guest', ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        RETURNING *`,
      ).bind(
        roomCode,
        submission.roomType,
        submission.cardPoolKey,
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
    nowSeconds + battleRoomTtlSeconds(submission.protocolVersion),
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

async function roomWithSession(database, code, sessionToken, nowSeconds, protocolVersion) {
  const roomCode = normalizeRoomCode(code);
  const row = await database.prepare(
    "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
  ).bind(roomCode).first();
  if (!row) throw new ApiError(404, "room_not_found", "没有找到这个房间。");
  if (Number(row.expires_at) <= nowSeconds) {
    throw new ApiError(410, "room_expired", "这个房间已经过期，请重新创建。");
  }
  if (row.protocol_version !== protocolVersion) {
    throw new ApiError(409, "protocol_mismatch", "请求版本与房间版本不一致，请刷新后重试。");
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

export async function kickBattleRoomGuest(database, code, submission, nowSeconds) {
  const session = await roomWithSession(
    database,
    code,
    submission.sessionToken,
    nowSeconds,
    submission.protocolVersion,
  );
  if (session.role !== "host") {
    throw new ApiError(403, "host_only", "只有房主可以移出挑战者。");
  }
  const updated = await database.prepare(
    `UPDATE battle_rooms_v3 SET
      status = 'waiting_guest',
      guest_name = NULL,
      guest_token_hash = NULL,
      guest_lineup_code = NULL,
      guest_ready_at = NULL,
      guest_pack_count = 0,
      guest_pack_request_id = NULL,
      guest_rematch_mode = NULL,
      joined_at = NULL,
      match_seed = NULL,
      started_at = NULL,
      expires_at = ?1
    WHERE room_code = ?2
      AND host_token_hash = ?3
      AND status = 'selecting'
      AND guest_name IS NOT NULL
      AND guest_lineup_code IS NULL
    RETURNING *`,
  ).bind(
    nowSeconds + battleRoomTtlSeconds(session.row.protocol_version),
    session.roomCode,
    session.tokenHash,
  ).first();
  if (updated) return publicRoom(updated, nowSeconds);

  const latest = await database.prepare(
    "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
  ).bind(session.roomCode).first();
  if (!latest?.guest_name) {
    throw new ApiError(409, "guest_not_present", "当前没有可以移出的挑战者。");
  }
  if (latest.guest_lineup_code || latest.status === "complete") {
    throw new ApiError(409, "guest_lineup_locked", "对方已经锁定阵容，不能再移出。");
  }
  throw new ApiError(409, "guest_kick_conflict", "房间状态已经变化，请刷新后重试。");
}

export async function submitBattleRoomLineup(database, code, submission, nowSeconds) {
  const session = await roomWithSession(
    database,
    code,
    submission.sessionToken,
    nowSeconds,
    submission.protocolVersion,
  );
  if (submission.protocolVersion === BATTLE_ROOM_STRATEGY_PROTOCOL) {
    const seriesConfig = await database.prepare(
      `SELECT card_pool_key FROM battle_room_series_v1
      WHERE room_code = ?1 AND round_number = ?2`,
    ).bind(session.roomCode, Number(session.row.round_number || 1)).first();
    await assertCanonicalStrategyRoomLineup(
      submission.lineupCode,
      seriesConfig?.card_pool_key || session.row.card_pool_key || "all",
    );
  }
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
  const sessionColumn = session.role === "host" ? "host_token_hash" : "guest_token_hash";
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
      AND ${sessionColumn} = ?6
    RETURNING *`,
  ).bind(
    submission.lineupCode,
    nowSeconds,
    seed,
    nowSeconds + battleRoomTtlSeconds(session.row.protocol_version),
    session.roomCode,
    session.tokenHash,
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
  const session = await roomWithSession(
    database,
    code,
    submission.sessionToken,
    nowSeconds,
    submission.protocolVersion,
  );
  if (session.row.status === "complete") {
    const updated = await database.prepare(
      "UPDATE battle_rooms_v3 SET expires_at = ?1 WHERE room_code = ?2 RETURNING *",
    ).bind(nowSeconds + battleRoomTtlSeconds(session.row.protocol_version), session.roomCode).first();
    return publicRoom(updated || session.row, nowSeconds);
  }
  throw new ApiError(409, "result_not_ready", "双方锁定阵容后才能查看结果。");
}

export async function consumeBattleRoomPack(database, code, submission, nowSeconds) {
  const session = await roomWithSession(
    database,
    code,
    submission.sessionToken,
    nowSeconds,
    submission.protocolVersion,
  );
  const ownColumn = session.role === "host" ? "host_pack_count" : "guest_pack_count";
  const packRequestColumn = session.role === "host" ? "host_pack_request_id" : "guest_pack_request_id";
  const lineupColumn = session.role === "host" ? "host_lineup_code" : "guest_lineup_code";
  const sessionColumn = session.role === "host" ? "host_token_hash" : "guest_token_hash";
  const strategyRoom = session.row.protocol_version === BATTLE_ROOM_STRATEGY_PROTOCOL;
  const packUpdate = `UPDATE battle_rooms_v3 SET
    ${ownColumn} = ${ownColumn} + 1,
    ${strategyRoom ? `${packRequestColumn} = ?5,` : ""}
    expires_at = ?1
  WHERE room_code = ?2
    AND status IN ('waiting_guest', 'selecting')
    AND ${lineupColumn} IS NULL
    AND ${sessionColumn} = ?3
    AND (room_type = 'open_lineup' OR ${ownColumn} < 3)
    ${strategyRoom ? `AND ${ownColumn} = ?4
    AND (${packRequestColumn} IS NULL OR ${packRequestColumn} != ?5)` : ""}
  RETURNING *`;
  const packStatement = database.prepare(packUpdate).bind(
    nowSeconds + battleRoomTtlSeconds(session.row.protocol_version),
    session.roomCode,
    session.tokenHash,
    ...(strategyRoom ? [submission.expectedPackCount, submission.requestId] : []),
  );
  const updated = await packStatement.first();
  if (!updated) {
    if (strategyRoom) {
      const latest = await database.prepare(
        "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
      ).bind(session.roomCode).first();
      const latestCount = Number(latest?.[ownColumn] || 0);
      if (latest?.[packRequestColumn] === submission.requestId) {
        if (latest?.[sessionColumn] === session.tokenHash
          && latestCount === submission.expectedPackCount + 1) {
          return {
            room: publicRoom(latest, nowSeconds),
            packCount: latestCount,
            idempotent: true,
          };
        }
        throw new ApiError(409, "pack_request_conflict", "开包请求标识已用于其他状态。");
      }
      if (latestCount !== submission.expectedPackCount) {
        throw new ApiError(
          409,
          "pack_state_mismatch",
          "开包状态已经变化，请刷新房间后重试。",
        );
      }
    }
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

async function ensureStrategyRematchSeries(database, roomCode, round, cardPoolKey, nowSeconds) {
  await database.prepare(
    `INSERT INTO battle_room_series_v1 (
      room_code, round_number, protocol_version, card_pool_key, status, current_game_number,
      host_game_wins, guest_game_wins, settlement_version, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, 'waiting_start', 0, 0, 0, ?5, ?6, ?6)
    ON CONFLICT(room_code, round_number) DO NOTHING`,
  ).bind(
    roomCode,
    round,
    BATTLE_ROOM_STRATEGY_PROTOCOL,
    cardPoolKey,
    BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
    nowSeconds,
  ).run();
}

async function requestBattleRoomStrategyRematch(database, code, submission, nowSeconds) {
  const session = await roomWithSession(
    database,
    code,
    submission.sessionToken,
    nowSeconds,
    submission.protocolVersion,
  );
  const currentRound = Number(session.row.round_number || 1);
  if (submission.round !== currentRound) {
    if (submission.round === currentRound - 1) {
      const prior = await database.prepare(
        `SELECT status, protocol_version, settlement_version FROM battle_room_series_v1
        WHERE room_code = ?1 AND round_number = ?2`,
      ).bind(session.roomCode, submission.round).first();
      if (prior && ["complete", "cancelled"].includes(prior.status)
        && prior.protocol_version === BATTLE_ROOM_STRATEGY_PROTOCOL
        && prior.settlement_version === BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION) {
        await ensureStrategyRematchSeries(
          database,
          session.roomCode,
          currentRound,
          session.row.card_pool_key || "all",
          nowSeconds,
        );
        return publicRoom(session.row, nowSeconds);
      }
    }
    throw new ApiError(409, "series_round_mismatch", "再战轮次与当前房间不一致，请刷新后重试。");
  }
  const series = await database.prepare(
    `SELECT * FROM battle_room_series_v1
    WHERE room_code = ?1 AND round_number = ?2`,
  ).bind(session.roomCode, currentRound).first();
  if (!series) throw new ApiError(409, "series_not_started", "逐场系列赛尚未开始。");
  if (series.protocol_version !== BATTLE_ROOM_STRATEGY_PROTOCOL
    || series.settlement_version !== BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION) {
    throw new ApiError(409, "strategy_settlement_version_mismatch", "本轮结算版本与当前服务不一致。");
  }
  if (!["complete", "cancelled"].includes(series.status)) {
    throw new ApiError(409, "series_not_complete", "本轮逐场系列赛尚未结束。");
  }
  if (series.status === "complete") {
    const decisive = await database.prepare(
      `SELECT host_revealed_at, guest_revealed_at
      FROM battle_room_series_games_v1
      WHERE room_code = ?1 AND round_number = ?2 AND game_number = ?3
        AND status = 'settled_result_ready'`,
    ).bind(session.roomCode, currentRound, Number(series.current_game_number)).first();
    if (!decisive?.[session.role + "_revealed_at"]) {
      throw new ApiError(409, "result_not_revealed", "请先查看决胜场结果再确认再战。");
    }
  }

  if (submission.cardPoolKey != null && session.role !== "host") {
    throw new ApiError(403, "host_only_card_pool", "只有房主可以选择下一轮卡池。");
  }
  const currentCardPoolKey = series.card_pool_key || session.row.card_pool_key || "all";
  const proposedCardPoolKey = session.role === "host"
    ? submission.cardPoolKey || currentCardPoolKey
    : null;
  if (proposedCardPoolKey && proposedCardPoolKey !== currentCardPoolKey) {
    if (submission.mode !== "redraft") {
      throw new ApiError(409, "card_pool_change_requires_redraft", "更换卡池必须选择重新选人。");
    }
    if (session.row.room_type !== "fair_pack") {
      throw new ApiError(409, "card_pool_change_unavailable", "当前房间类型不能更换卡池。");
    }
  }

  const ownColumn = session.role === "host" ? "host_rematch_mode" : "guest_rematch_mode";
  await database.prepare(
    `UPDATE battle_rooms_v3 SET
      ${ownColumn} = ?1,
      rematch_card_pool_key = CASE WHEN ?2 = 'host' THEN ?3 ELSE rematch_card_pool_key END,
      expires_at = ?4
    WHERE room_code = ?5 AND protocol_version = ?6 AND round_number = ?7
      AND status = 'complete' AND ${ownColumn} IS NULL`,
  ).bind(
    submission.mode,
    session.role,
    proposedCardPoolKey,
    nowSeconds + battleRoomTtlSeconds(BATTLE_ROOM_STRATEGY_PROTOCOL),
    session.roomCode,
    BATTLE_ROOM_STRATEGY_PROTOCOL,
    currentRound,
  ).run();
  const proposed = await database.prepare(
    "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
  ).bind(session.roomCode).first();
  if (proposed?.[ownColumn] && proposed[ownColumn] !== submission.mode) {
    throw new ApiError(409, "rematch_vote_conflict", "本轮再战选择已经提交，不能重复修改。");
  }
  if (session.role === "host" && proposed?.host_rematch_mode
    && (proposed.rematch_card_pool_key || currentCardPoolKey) !== proposedCardPoolKey) {
    throw new ApiError(409, "rematch_vote_conflict", "下一轮卡池已经提交，不能重复修改。");
  }
  if (!proposed?.host_rematch_mode || !proposed?.guest_rematch_mode) {
    return publicRoom(proposed, nowSeconds);
  }
  if (series.status === "complete") {
    const decisive = await database.prepare(
      `SELECT host_revealed_at, guest_revealed_at
      FROM battle_room_series_games_v1
      WHERE room_code = ?1 AND round_number = ?2 AND game_number = ?3
        AND status = 'settled_result_ready'`,
    ).bind(session.roomCode, currentRound, Number(series.current_game_number)).first();
    if (!decisive?.host_revealed_at || !decisive?.guest_revealed_at) {
      return publicRoom(proposed, nowSeconds);
    }
    if (Number(proposed.scored_round || 0) < currentRound) {
      throw new ApiError(409, "series_score_pending", "本轮权威比分正在恢复，请刷新后重试。");
    }
  }

  const nextRound = currentRound + 1;
  const nextCardPoolKey = proposed.rematch_card_pool_key || currentCardPoolKey;
  const cardPoolChanged = nextCardPoolKey !== currentCardPoolKey;
  const hostRedraft = cardPoolChanged || proposed.host_rematch_mode === "redraft";
  const guestRedraft = cardPoolChanged || proposed.guest_rematch_mode === "redraft";
  const anyRedraft = hostRedraft || guestRedraft;
  const updated = await database.prepare(
    `UPDATE battle_rooms_v3 SET
      round_number = ?1,
      card_pool_key = ?2,
      status = ?3,
      host_lineup_code = CASE WHEN ?4 = 1 THEN NULL ELSE host_lineup_code END,
      guest_lineup_code = CASE WHEN ?5 = 1 THEN NULL ELSE guest_lineup_code END,
      host_ready_at = CASE WHEN ?4 = 1 THEN NULL ELSE host_ready_at END,
      guest_ready_at = CASE WHEN ?5 = 1 THEN NULL ELSE guest_ready_at END,
      host_pack_count = CASE WHEN ?4 = 1 THEN 0 ELSE host_pack_count END,
      guest_pack_count = CASE WHEN ?5 = 1 THEN 0 ELSE guest_pack_count END,
      host_pack_request_id = CASE WHEN ?4 = 1 THEN NULL ELSE host_pack_request_id END,
      guest_pack_request_id = CASE WHEN ?5 = 1 THEN NULL ELSE guest_pack_request_id END,
      match_seed = CASE WHEN ?6 = 1 THEN NULL ELSE ?7 END,
      started_at = CASE WHEN ?6 = 1 THEN NULL ELSE ?8 END,
      host_rematch_mode = NULL,
      guest_rematch_mode = NULL,
      rematch_card_pool_key = NULL,
      expires_at = ?9
    WHERE room_code = ?10 AND protocol_version = ?11 AND round_number = ?12
      AND status = 'complete'
      AND host_lineup_code IS NOT NULL AND guest_lineup_code IS NOT NULL
      AND host_rematch_mode IS NOT NULL AND guest_rematch_mode IS NOT NULL
      AND COALESCE(rematch_card_pool_key, card_pool_key) = ?2
      AND EXISTS (
        SELECT 1 FROM battle_room_series_v1 AS series
        WHERE series.room_code = ?10 AND series.round_number = ?12
          AND series.status IN ('complete', 'cancelled')
          AND series.protocol_version = ?11 AND series.settlement_version = ?13
      )
    RETURNING *`,
  ).bind(
    nextRound,
    nextCardPoolKey,
    anyRedraft ? "selecting" : "complete",
    hostRedraft ? 1 : 0,
    guestRedraft ? 1 : 0,
    anyRedraft ? 1 : 0,
    randomSeed(),
    nowSeconds,
    nowSeconds + battleRoomTtlSeconds(BATTLE_ROOM_STRATEGY_PROTOCOL),
    session.roomCode,
    BATTLE_ROOM_STRATEGY_PROTOCOL,
    currentRound,
    BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
  ).first();
  const latest = updated || await database.prepare(
    "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1",
  ).bind(session.roomCode).first();
  if (Number(latest?.round_number) === nextRound) {
    await ensureStrategyRematchSeries(
      database,
      session.roomCode,
      nextRound,
      latest.card_pool_key || nextCardPoolKey,
      nowSeconds,
    );
  }
  return publicRoom(latest, nowSeconds);
}

export async function requestBattleRoomRematch(database, code, submission, nowSeconds) {
  if (submission.protocolVersion === BATTLE_ROOM_STRATEGY_PROTOCOL) {
    return requestBattleRoomStrategyRematch(database, code, submission, nowSeconds);
  }
  const session = await roomWithSession(
    database,
    code,
    submission.sessionToken,
    nowSeconds,
    submission.protocolVersion,
  );
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
  const session = await roomWithSession(
    database,
    code,
    submission.sessionToken,
    nowSeconds,
    submission.protocolVersion,
  );
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
