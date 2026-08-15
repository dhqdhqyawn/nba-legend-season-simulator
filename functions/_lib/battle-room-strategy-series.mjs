import { ApiError, isApiError } from "./errors.mjs";
import {
  BATTLE_ROOM_STRATEGY_PROTOCOL,
  BATTLE_ROOM_STRATEGY_TTL_SECONDS,
  normalizeRoomCode,
} from "./battle-rooms-validation.mjs";
import {
  BATTLE_ROOM_GAME_RESULT_SCHEMA,
  BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
  assertStrategyLineupContract,
} from "./battle-room-strategy-validation.mjs";
import {
  decodeStrategyRoomLineup,
  settleStrategyRoomGame as defaultSettleStrategyRoomGame,
} from "./nba5-strategy-room-settler.mjs";
import { constantTimeEqual, sha256Hex } from "./security.mjs";

export { BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION };

const HEARTBEAT_WRITE_INTERVAL_SECONDS = 60 * 60;
// D1's current maximum string/BLOB/table-row size is 2,000,000 bytes. Preserve
// the authoritative raw result for audit, but keep the player-facing projection
// independently small so a seven-game snapshot never materializes raw history.
const RESULT_MAX_BYTES = 1_800_000;
const PUBLIC_RESULT_MAX_BYTES = 128_000;

const GAME_STATE_COLUMNS = `
  room_code, round_number, game_number, status, game_seed,
  host_lineup_json, guest_lineup_json, winner_role, host_score, guest_score,
  CASE WHEN result_json IS NULL THEN 0 ELSE 1 END AS result_json_present,
  CASE WHEN public_result_json IS NULL THEN 0 ELSE 1 END AS public_result_json_present,
  result_hash, settlement_version, settled_at,
  host_revealed_at, guest_revealed_at,
  host_next_ready_at, guest_next_ready_at,
  created_at, updated_at`;

function ownOther(role) {
  return role === "host"
    ? { own: "host", opponent: "guest" }
    : { own: "guest", opponent: "host" };
}

function asRows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

async function all(database, sql, ...bindings) {
  try {
    const result = await database.prepare(sql).bind(...bindings).all();
    return asRows(result);
  } catch (error) {
    if (isApiError(error)) throw error;
    console.error("NBA5 strategy room storage read failed", error);
    throw new ApiError(
      503,
      "strategy_storage_unavailable",
      "逐场房间状态暂时无法读取，请稍后重试。",
      { "Retry-After": "2" },
    );
  }
}

async function first(database, sql, ...bindings) {
  try {
    return await database.prepare(sql).bind(...bindings).first();
  } catch (error) {
    if (isApiError(error)) throw error;
    console.error("NBA5 strategy room storage read failed", error);
    throw new ApiError(
      503,
      "strategy_storage_unavailable",
      "逐场房间状态暂时无法读取，请稍后重试。",
      { "Retry-After": "2" },
    );
  }
}

async function run(database, sql, ...bindings) {
  try {
    return await database.prepare(sql).bind(...bindings).run();
  } catch (error) {
    if (isApiError(error)) throw error;
    console.error("NBA5 strategy room storage write failed", error);
    throw new ApiError(
      503,
      "strategy_storage_unavailable",
      "逐场房间状态暂时无法保存，请稍后重试。",
      { "Retry-After": "2" },
    );
  }
}

function assertSeriesSettlementLineage(series, games = []) {
  if (series && (series.protocol_version !== BATTLE_ROOM_STRATEGY_PROTOCOL
    || series.settlement_version !== BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION)) {
    throw new ApiError(409, "strategy_settlement_version_mismatch", "本轮结算版本与当前服务不一致。");
  }
  if (games.some(game => game.settlement_version !== BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION)) {
    throw new ApiError(409, "strategy_settlement_version_mismatch", "本轮存在不同版本的单场记录。");
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(String(value));
  } catch {
    throw new ApiError(500, "strategy_state_corrupt", label + "无法解析。");
  }
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalStrategyRoomJson(value) {
  let detached;
  try {
    detached = JSON.parse(JSON.stringify(value));
  } catch {
    throw new ApiError(500, "strategy_result_not_serializable", "单场结果无法保存。");
  }
  return JSON.stringify(canonicalValue(detached));
}

function iso(seconds) {
  return seconds == null ? null : new Date(Number(seconds) * 1000).toISOString();
}

function assertGameNumber(value) {
  const gameNumber = Number(value);
  if (!Number.isSafeInteger(gameNumber) || gameNumber < 1 || gameNumber > 7) {
    throw new ApiError(400, "invalid_game_number", "比赛场次必须是 G1–G7。");
  }
  return gameNumber;
}

async function requireStrategyRoomSession(database, code, sessionToken, nowSeconds) {
  const roomCode = normalizeRoomCode(code);
  const row = await first(database, "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1", roomCode);
  if (!row) throw new ApiError(404, "room_not_found", "没有找到这个房间。");
  if (Number(row.expires_at) <= nowSeconds) {
    throw new ApiError(410, "room_expired", "这个房间已经过期，请重新创建。");
  }
  if (row.protocol_version !== BATTLE_ROOM_STRATEGY_PROTOCOL) {
    throw new ApiError(409, "strategy_room_required", "这个房间使用快速模拟协议，不能进入逐场策略。");
  }
  const tokenHash = await sha256Hex(sessionToken);
  const role = constantTimeEqual(tokenHash, row.host_token_hash)
    ? "host"
    : row.guest_token_hash && constantTimeEqual(tokenHash, row.guest_token_hash)
      ? "guest"
      : null;
  if (!role) throw new ApiError(401, "invalid_room_session", "房间身份已经失效，请重新进入房间。");

  const renewedUntil = nowSeconds + BATTLE_ROOM_STRATEGY_TTL_SECONDS;
  const writeThreshold = nowSeconds + BATTLE_ROOM_STRATEGY_TTL_SECONDS - HEARTBEAT_WRITE_INTERVAL_SECONDS;
  const touched = await first(
    database,
    `UPDATE battle_rooms_v3 SET expires_at = ?1
    WHERE room_code = ?2 AND expires_at > ?3 AND expires_at < ?4
    RETURNING expires_at`,
    renewedUntil,
    roomCode,
    nowSeconds,
    writeThreshold,
  );
  if (touched) row.expires_at = Number(touched.expires_at);
  return { roomCode, row, role, tokenHash };
}

function assertCurrentRound(session, round) {
  const currentRound = Number(session.row.round_number || 1);
  if (Number(round) !== currentRound) {
    throw new ApiError(409, "series_round_mismatch", "请求轮次与当前房间不一致，请刷新后重试。");
  }
  return currentRound;
}

async function loadSeriesState(database, roomCode, round) {
  const [series, games, strategies] = await Promise.all([
    first(
      database,
      "SELECT * FROM battle_room_series_v1 WHERE room_code = ?1 AND round_number = ?2",
      roomCode,
      round,
    ),
    all(
      database,
      `SELECT ${GAME_STATE_COLUMNS}
      FROM battle_room_series_games_v1
      WHERE room_code = ?1 AND round_number = ?2 ORDER BY game_number`,
      roomCode,
      round,
    ),
    all(
      database,
      `SELECT * FROM battle_room_game_strategies_v1
      WHERE room_code = ?1 AND round_number = ?2 ORDER BY game_number, role`,
      roomCode,
      round,
    ),
  ]);
  assertSeriesSettlementLineage(series, games);
  return { series, games, strategies };
}

function strategyFor(strategies, gameNumber, role) {
  const row = strategies.find(item => Number(item.game_number) === gameNumber && item.role === role);
  return row ? parseJson(row.strategy_json, "策略记录") : null;
}

function hasGameResult(game) {
  return Boolean(
    game?.public_result_json_present
    || game?.result_json_present
    || game?.public_result_json
    || game?.result_json
    || game?.public_result,
  );
}

function publicScalar(value) {
  return value == null || ["string", "number", "boolean"].includes(typeof value)
    ? value ?? null
    : null;
}

function publicRuntimeStrategy(strategy) {
  if (!strategy || typeof strategy !== "object" || Array.isArray(strategy)) return {};
  const offense = strategy.offense;
  const defense = strategy.defense;
  if (!offense && !defense) return {};
  return {
    offense: {
      main: publicScalar(offense?.main),
      auxiliary: publicScalar(offense?.auxiliary),
      primaryScorerId: publicScalar(offense?.primaryScorerId),
      secondaryScorerId: publicScalar(offense?.secondaryScorerId),
    },
    defense: {
      main: publicScalar(defense?.main),
      auxiliary: publicScalar(defense?.auxiliary),
      focusOpponentId: publicScalar(defense?.focusOpponentId),
      leadDefenderId: publicScalar(defense?.leadDefenderId),
      rimProtectorId: publicScalar(defense?.rimProtectorId),
    },
  };
}

function publicNarrativeEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  return {
    schemaVersion: publicScalar(event.schemaVersion),
    id: publicScalar(event.id),
    gameNumber: publicScalar(event.gameNumber),
    type: publicScalar(event.type),
    severity: publicScalar(event.severity),
    label: publicScalar(event.label),
    beneficiaryId: publicScalar(event.beneficiaryId),
    affectedTeamId: publicScalar(event.affectedTeamId),
    teamId: publicScalar(event.teamId),
    actorCardKey: publicScalar(event.actorCardKey),
    supportCardKey: publicScalar(event.supportCardKey),
    targetCardKey: publicScalar(event.targetCardKey),
    attackerId: publicScalar(event.attackerId),
    defenderId: publicScalar(event.defenderId),
    statFocus: publicScalar(event.statFocus),
    major: publicScalar(event.major),
    constraint: publicScalar(event.constraint),
    changesSeriesOutcome: publicScalar(event.changesSeriesOutcome),
    resultEffect: publicScalar(event.resultEffect),
    evidence: event.evidence && typeof event.evidence === "object" ? {
      pointsDelta: publicScalar(event.evidence.pointsDelta),
      trueShootingDelta: publicScalar(event.evidence.trueShootingDelta),
      assistDelta: publicScalar(event.evidence.assistDelta),
      turnoverDelta: publicScalar(event.evidence.turnoverDelta),
      shotVolumeDelta: publicScalar(event.evidence.shotVolumeDelta),
      responsibilityStatus: publicScalar(event.evidence.responsibilityStatus),
    } : null,
  };
}

function publicPathEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  return {
    type: publicScalar(event.type),
    severity: publicScalar(event.severity),
    label: publicScalar(event.label),
    attackerId: publicScalar(event.attackerId),
    defenderId: publicScalar(event.defenderId),
    emphasizedPath: publicScalar(event.emphasizedPath),
    gameShare: publicScalar(event.gameShare),
    pathShareDelta: publicScalar(event.pathShareDelta),
    deEmphasizedPath: publicScalar(event.deEmphasizedPath),
    deEmphasizedGameShare: publicScalar(event.deEmphasizedGameShare),
    deEmphasizedPathShareDelta: publicScalar(event.deEmphasizedPathShareDelta),
    jumpShareDelta: publicScalar(event.jumpShareDelta),
    pressureShareDelta: publicScalar(event.pressureShareDelta),
  };
}

function publicPrimaryEventSide(side) {
  if (!side || typeof side !== "object" || Array.isArray(side)) return null;
  return {
    version: publicScalar(side.version),
    event: publicNarrativeEvent(side.event),
    pathEvent: publicPathEvent(side.pathEvent),
  };
}

function publicSecondaryEventSide(side) {
  if (!side || typeof side !== "object" || Array.isArray(side)) return null;
  return {
    event: publicNarrativeEvent(side.event),
    pathEvent: publicPathEvent(side.pathEvent),
    fallback: Boolean(side.fallback),
  };
}

const PUBLIC_BOX_STAT_FIELDS = Object.freeze([
  "minutes", "pts", "reb", "ast", "stl", "blk", "tov",
  "fgm", "fga", "threePm", "threePa", "ftm", "fta",
]);

function publicBoxStats(stats, { player = false } = {}) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return null;
  return Object.fromEntries([
    ...(player ? [["cardKey", publicScalar(stats.cardKey)]] : []),
    ...PUBLIC_BOX_STAT_FIELDS.map(field => [field, publicScalar(stats[field])]),
  ]);
}

function publicTeamBox(box) {
  if (!box || typeof box !== "object" || Array.isArray(box)) return null;
  return {
    teamId: publicScalar(box.teamId),
    opponentId: publicScalar(box.opponentId),
    players: Array.isArray(box.players)
      ? box.players.map(player => publicBoxStats(player, { player: true }))
      : [],
    rotation: box.rotation && typeof box.rotation === "object" ? {
      coreMinutes: publicScalar(box.rotation.coreMinutes),
      benchMinutes: publicScalar(box.rotation.benchMinutes),
      points: publicScalar(box.rotation.points),
    } : null,
    totals: publicBoxStats(box.totals),
  };
}

export function projectStrategyRoomPublicResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const game = result.game && typeof result.game === "object" ? result.game : {};
  return {
    schemaVersion: publicScalar(result.schemaVersion),
    settlementVersion: publicScalar(result.settlementVersion),
    winnerRole: publicScalar(result.winnerRole),
    score: {
      host: publicScalar(result.score?.host),
      guest: publicScalar(result.score?.guest),
    },
    game: {
      number: publicScalar(game.number),
      homeTeamId: publicScalar(game.homeTeamId),
      winnerId: publicScalar(game.winnerId),
      pace: publicScalar(game.pace),
      teamAScore: publicScalar(game.teamAScore),
      teamBScore: publicScalar(game.teamBScore),
      strategy: publicRuntimeStrategy(game.strategy),
      cpuStrategy: publicRuntimeStrategy(game.cpuStrategy),
      event: publicNarrativeEvent(game.event),
      specialEvent: publicNarrativeEvent(game.specialEvent),
      teamABox: publicTeamBox(game.teamABox),
      teamBBox: publicTeamBox(game.teamBBox),
      primaryMatchupEvents: {
        teamA: publicPrimaryEventSide(game.primaryMatchupEvents?.teamA),
        teamB: publicPrimaryEventSide(game.primaryMatchupEvents?.teamB),
        teamAFocus: publicPrimaryEventSide(game.primaryMatchupEvents?.teamAFocus),
        teamBFocus: publicPrimaryEventSide(game.primaryMatchupEvents?.teamBFocus),
      },
      secondaryMatchupEvents: {
        teamA: publicSecondaryEventSide(game.secondaryMatchupEvents?.teamA),
        teamB: publicSecondaryEventSide(game.secondaryMatchupEvents?.teamB),
      },
    },
  };
}

function gameResult(row) {
  if (row?.public_result) return row.public_result;
  return row?.result_json
    ? projectStrategyRoomPublicResult(parseJson(row.result_json, "单场结果"))
    : null;
}

function lastStrategySnapshot(strategies, role, maximumGame = 7) {
  const row = strategies
    .filter(item => item.role === role && Number(item.game_number) <= maximumGame)
    .sort((left, right) => Number(right.game_number) - Number(left.game_number))[0];
  return row ? parseJson(row.strategy_json, "阵容快照").lineupSnapshot : null;
}

function viewerPhase(series, currentGame, ownRole, opponentRole) {
  if (series?.status === "cancelled") return "cancelled";
  if (!series || series.status === "waiting_start") return "waiting_start";
  if (!currentGame) return series.status === "complete" ? "series_complete" : "strategy_open";
  const ownRevealed = Boolean(currentGame[ownRole + "_revealed_at"]);
  const ownNextReady = Boolean(currentGame[ownRole + "_next_ready_at"]);
  const opponentNextReady = Boolean(currentGame[opponentRole + "_next_ready_at"]);
  if (hasGameResult(currentGame) && !ownRevealed) return "result_ready";
  if (series.status === "complete") return "series_complete";
  if (ownNextReady && !opponentNextReady) return "next_ready_waiting";
  if (hasGameResult(currentGame)) return "result_revealed";
  const ownSubmitted = currentGame.__ownSubmitted;
  const opponentSubmitted = currentGame.__opponentSubmitted;
  if (ownSubmitted && !opponentSubmitted) return "waiting_opponent_strategy";
  return "strategy_open";
}

export function buildStrategyRoomViewerSnapshot({ room, role, series, games, strategies }) {
  const { own, opponent } = ownOther(role);
  const currentGameNumber = Number(series?.current_game_number || 0);
  const currentGameRow = games.find(game => Number(game.game_number) === currentGameNumber) || null;
  const ownCurrentStrategy = currentGameRow ? strategyFor(strategies, currentGameNumber, own) : null;
  const opponentCurrentStrategy = currentGameRow ? strategyFor(strategies, currentGameNumber, opponent) : null;
  const currentGame = currentGameRow ? {
    ...currentGameRow,
    __ownSubmitted: Boolean(ownCurrentStrategy),
    __opponentSubmitted: Boolean(opponentCurrentStrategy),
  } : null;
  const ownRevealedCurrent = Boolean(currentGame?.[own + "_revealed_at"]);
  const hideCurrentOutcome = Boolean(hasGameResult(currentGame) && !ownRevealedCurrent);
  const firstGame = games.find(game => Number(game.game_number) === 1) || null;
  const opponentRevealed = Boolean(hasGameResult(firstGame) && firstGame?.[own + "_revealed_at"]);
  const ownLineupCode = room[own + "_lineup_code"] || null;
  const opponentLineupCode = opponentRevealed ? room[opponent + "_lineup_code"] || null : null;
  const ownSnapshot = currentGameNumber
    ? lastStrategySnapshot(strategies, own, currentGameNumber)
    : null;
  const opponentSnapshot = opponentRevealed && currentGameNumber
    ? lastStrategySnapshot(strategies, opponent, currentGameNumber)
    : null;
  const authoritativeHostWins = Number(series?.host_game_wins || 0);
  const authoritativeGuestWins = Number(series?.guest_game_wins || 0);
  const visibleHostWins = Math.max(0, authoritativeHostWins - (
    hideCurrentOutcome && currentGame?.winner_role === "host" ? 1 : 0
  ));
  const visibleGuestWins = Math.max(0, authoritativeGuestWins - (
    hideCurrentOutcome && currentGame?.winner_role === "guest" ? 1 : 0
  ));
  const ownWins = own === "host" ? visibleHostWins : visibleGuestWins;
  const opponentWins = opponent === "host" ? visibleHostWins : visibleGuestWins;
  const visibleSeriesStatus = series?.status === "complete" && hideCurrentOutcome
    ? "active"
    : series?.status || "waiting_start";

  const history = games.flatMap(game => {
    if (!hasGameResult(game) || !game[own + "_revealed_at"]) return [];
    const gameNumber = Number(game.game_number);
    const result = gameResult(game);
    const ownStrategy = strategyFor(strategies, gameNumber, own);
    const opponentStrategy = strategyFor(strategies, gameNumber, opponent);
    return [{
      gameNumber,
      winnerRole: game.winner_role,
      score: { host: Number(game.host_score), guest: Number(game.guest_score) },
      result,
      strategy: { own: ownStrategy, opponent: opponentStrategy },
      lineups: {
        own: ownStrategy?.lineupSnapshot || null,
        opponent: opponentStrategy?.lineupSnapshot || null,
      },
    }];
  });

  const publicCurrentResult = ownRevealedCurrent ? gameResult(currentGame) : null;
  return {
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
    room: {
      code: room.room_code,
      round: Number(room.round_number || 1),
      roomType: room.room_type,
      cardPoolKey: series?.card_pool_key || room.card_pool_key || "all",
      expiresAt: iso(room.expires_at),
    },
    role,
    phase: viewerPhase(series, currentGame, own, opponent),
    series: {
      status: visibleSeriesStatus,
      currentGameNumber,
      wins: {
        own: ownWins,
        opponent: opponentWins,
        host: visibleHostWins,
        guest: visibleGuestWins,
      },
      startReady: {
        own: Boolean(series?.[own + "_start_ready_at"]),
        opponent: Boolean(series?.[opponent + "_start_ready_at"]),
      },
      rematchReady: {
        own: Boolean(room[own + "_rematch_mode"]),
        opponent: Boolean(room[opponent + "_rematch_mode"]),
      },
      cancelledBy: series?.cancelled_by
        ? series.cancelled_by === own ? "own" : "opponent"
        : null,
    },
    lineups: {
      ownCode: ownLineupCode,
      opponentCode: opponentLineupCode,
      ownSnapshot,
      opponentSnapshot,
      opponentRevealed,
    },
    currentGame: currentGame ? {
      gameNumber: Number(currentGame.game_number),
      status: currentGame.status,
      ownSubmitted: currentGame.__ownSubmitted,
      opponentSubmitted: currentGame.__opponentSubmitted,
      resultReady: hasGameResult(currentGame),
      revealed: {
        own: Boolean(currentGame[own + "_revealed_at"]),
        opponent: Boolean(currentGame[opponent + "_revealed_at"]),
      },
      nextReady: {
        own: Boolean(currentGame[own + "_next_ready_at"]),
        opponent: Boolean(currentGame[opponent + "_next_ready_at"]),
      },
      strategy: {
        own: ownCurrentStrategy,
        opponent: ownRevealedCurrent ? opponentCurrentStrategy : null,
      },
      result: publicCurrentResult,
    } : null,
    history,
  };
}

function assertPublicResultSize(json) {
  if (new TextEncoder().encode(json).byteLength > PUBLIC_RESULT_MAX_BYTES) {
    throw new ApiError(503, "strategy_public_result_too_large", "本场公开结果超过保存上限，请重试。");
  }
}

async function hydrateViewerResults(database, session, games, round) {
  const revealColumn = session.role + "_revealed_at";
  const hydrated = [];
  for (const game of games) {
    if (!hasGameResult(game) || !game[revealColumn]) {
      hydrated.push(game);
      continue;
    }
    const stored = await first(
      database,
      `SELECT public_result_json FROM battle_room_series_games_v1
      WHERE room_code = ?1 AND round_number = ?2 AND game_number = ?3`,
      session.roomCode,
      round,
      Number(game.game_number),
    );
    if (!stored?.public_result_json) {
      throw new ApiError(500, "strategy_state_corrupt", "已结算的单场结果无法读取。");
    }
    hydrated.push({
      ...game,
      public_result: projectStrategyRoomPublicResult(
        parseJson(stored.public_result_json, "单场公开结果"),
      ),
    });
  }
  return hydrated;
}

async function snapshotForSession(database, session) {
  const round = Number(session.row.round_number || 1);
  const state = await loadSeriesState(database, session.roomCode, round);
  state.games = await hydrateViewerResults(database, session, state.games, round);
  return buildStrategyRoomViewerSnapshot({
    room: session.row,
    role: session.role,
    ...state,
  });
}

async function ensureSeries(database, session, nowSeconds) {
  const round = Number(session.row.round_number || 1);
  await run(
    database,
    `INSERT INTO battle_room_series_v1 (
      room_code, round_number, protocol_version, card_pool_key, status, current_game_number,
      host_game_wins, guest_game_wins, settlement_version, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, 'waiting_start', 0, 0, 0, ?5, ?6, ?6)
    ON CONFLICT(room_code, round_number) DO NOTHING`,
    session.roomCode,
    round,
    BATTLE_ROOM_STRATEGY_PROTOCOL,
    session.row.card_pool_key || "all",
    BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
    nowSeconds,
  );
  const series = await first(
    database,
    "SELECT * FROM battle_room_series_v1 WHERE room_code = ?1 AND round_number = ?2",
    session.roomCode,
    round,
  );
  assertSeriesSettlementLineage(series);
  return series;
}

export async function markBattleRoomSeriesStartReady(database, code, submission, nowSeconds) {
  const session = await requireStrategyRoomSession(database, code, submission.sessionToken, nowSeconds);
  const round = assertCurrentRound(session, submission.round);
  if (session.row.status !== "complete"
    || !session.row.host_lineup_code || !session.row.guest_lineup_code || !session.row.match_seed) {
    throw new ApiError(409, "lineups_not_locked", "双方锁定阵容后才能准备开始系列赛。");
  }
  let series = await ensureSeries(database, session, nowSeconds);
  if (series.status === "cancelled") {
    throw new ApiError(409, "series_cancelled", "本轮已经取消，不能再次开始。");
  }
  if (series.status === "complete" || series.status === "active") {
    return snapshotForSession(database, session);
  }
  const readyColumn = session.role + "_start_ready_at";
  await run(
    database,
    `UPDATE battle_room_series_v1 SET
      ${readyColumn} = COALESCE(${readyColumn}, ?1), updated_at = ?1
    WHERE room_code = ?2 AND round_number = ?3 AND status = 'waiting_start'`,
    nowSeconds,
    session.roomCode,
    round,
  );
  series = await first(
    database,
    "SELECT * FROM battle_room_series_v1 WHERE room_code = ?1 AND round_number = ?2",
    session.roomCode,
    round,
  );
  if (series.host_start_ready_at && series.guest_start_ready_at) {
    await run(
      database,
      `INSERT INTO battle_room_series_games_v1 (
        room_code, round_number, game_number, status, settlement_version, created_at, updated_at
      ) VALUES (?1, ?2, 1, 'strategy_open', ?3, ?4, ?4)
      ON CONFLICT(room_code, round_number, game_number) DO NOTHING`,
      session.roomCode,
      round,
      BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
      nowSeconds,
    );
    await run(
      database,
      `UPDATE battle_room_series_v1 SET status = 'active', current_game_number = 1, updated_at = ?1
      WHERE room_code = ?2 AND round_number = ?3 AND status = 'waiting_start'
        AND host_start_ready_at IS NOT NULL AND guest_start_ready_at IS NOT NULL`,
      nowSeconds,
      session.roomCode,
      round,
    );
  }
  return snapshotForSession(database, session);
}

function persistedStrategy(submission) {
  return {
    schemaVersion: submission.schemaVersion,
    submissionSource: submission.submissionSource,
    lineupSnapshot: submission.lineupSnapshot,
    offense: submission.offense,
    defense: submission.defense,
  };
}

function canonicalLineupVersionKeys(lineupCode) {
  try {
    return decodeStrategyRoomLineup(lineupCode).map(card => (
      card?.v35?.sourceKey
      || card?.v34?.cardId
      || card?.eventProfile?.versionKey
      || card?.versionKey
      || card?.cardId
    ));
  } catch {
    throw new ApiError(400, "invalid_strategy_lineup", "阵容码不属于当前逐场策略卡池或位置不合法。");
  }
}

function assertCanonicalStrategyReferences(submission, ownLineupCode, opponentLineupCode, gameNumber) {
  const ownKeys = canonicalLineupVersionKeys(ownLineupCode);
  if (ownKeys.some((key, index) => key !== submission.lineupSnapshot[index])) {
    throw new ApiError(409, "lineup_snapshot_mismatch", "本场阵容快照必须使用服务端锁定的五个版本键。");
  }
  const own = new Set(ownKeys);
  for (const value of [
    submission.offense.primaryAttackerId,
    submission.offense.secondaryAttackerId,
    submission.defense.leadDefenderId,
    submission.defense.rimProtectorId,
  ]) {
    if (value && !own.has(value)) {
      throw new ApiError(400, "strategy_player_not_in_lineup", "主攻与防守角色必须来自自己的锁定五人。");
    }
  }
  if (gameNumber === 1 && submission.defense.focusTargetId) {
    throw new ApiError(400, "g1_focus_forbidden", "第一场不会提前公开对手，不能设置重点限制。");
  }
  if (gameNumber >= 2 && submission.defense.focusTargetId) {
    const opponent = new Set(canonicalLineupVersionKeys(opponentLineupCode));
    if (!opponent.has(submission.defense.focusTargetId)) {
      throw new ApiError(400, "focus_target_not_in_opponent_lineup", "重点限制对象必须来自对方锁定五人。");
    }
  }
}

// The public v4 contract uses product-facing field names, while the frozen
// browser strategy bridge still consumes its legacy runtime keys. Keep the
// stored/revealed payload stable and translate only at the server settler
// boundary so a valid manual strategy cannot silently fall back to auto.
export function strategyRoomWireToSettlerStrategy(strategy) {
  return {
    offense: {
      main: strategy?.offense?.primaryPlan || null,
      auxiliary: strategy?.offense?.secondaryPlan || null,
      primaryScorerId: strategy?.offense?.primaryAttackerId || null,
      secondaryScorerId: strategy?.offense?.secondaryAttackerId || null,
    },
    defense: {
      main: strategy?.defense?.primaryPlan || null,
      auxiliary: strategy?.defense?.secondaryPlan || null,
      focusOpponentId: strategy?.defense?.focusTargetId || null,
      leadDefenderId: strategy?.defense?.leadDefenderId || null,
      rimProtectorId: strategy?.defense?.rimProtectorId || null,
    },
  };
}

function normalizeSettlementEnvelope(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError(503, "strategy_settlement_invalid", "共享结算器没有返回单场结果。");
  }
  if (raw.schemaVersion !== BATTLE_ROOM_GAME_RESULT_SCHEMA) {
    throw new ApiError(503, "strategy_settlement_schema_mismatch", "共享结算器结果版本不一致。");
  }
  if (raw.settlementVersion !== BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION) {
    throw new ApiError(503, "strategy_settlement_version_mismatch", "共享结算器模型版本不一致。");
  }
  if (!/^(host|guest)$/.test(String(raw.winnerRole || ""))) {
    throw new ApiError(503, "strategy_settlement_invalid_winner", "共享结算器胜方无效。");
  }
  const hostScore = Number(raw.score?.host);
  const guestScore = Number(raw.score?.guest);
  if (!Number.isSafeInteger(hostScore) || !Number.isSafeInteger(guestScore)
    || hostScore < 0 || guestScore < 0 || hostScore > 300 || guestScore > 300
    || hostScore === guestScore) {
    throw new ApiError(503, "strategy_settlement_invalid_score", "共享结算器比分无效。");
  }
  const expectedWinner = hostScore > guestScore ? "host" : "guest";
  if (raw.winnerRole !== expectedWinner) {
    throw new ApiError(503, "strategy_settlement_winner_conflict", "共享结算器胜方与比分矛盾。");
  }
  const normalized = {
    schemaVersion: BATTLE_ROOM_GAME_RESULT_SCHEMA,
    settlementVersion: BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
    winnerRole: raw.winnerRole,
    score: { host: hostScore, guest: guestScore },
    game: raw.game,
  };
  const rawJson = canonicalStrategyRoomJson(normalized);
  if (new TextEncoder().encode(rawJson).byteLength > RESULT_MAX_BYTES) {
    throw new ApiError(503, "strategy_settlement_too_large", "共享结算器结果超过保存上限。");
  }
  const publicResult = projectStrategyRoomPublicResult(normalized);
  const publicJson = canonicalStrategyRoomJson(publicResult);
  assertPublicResultSize(publicJson);
  return { normalized, rawJson, publicJson };
}

async function reconcileSeriesScore(database, session, round, nowSeconds) {
  const counts = await first(
    database,
    `SELECT
      COALESCE(SUM(CASE WHEN winner_role = 'host' THEN 1 ELSE 0 END), 0) AS host_wins,
      COALESCE(SUM(CASE WHEN winner_role = 'guest' THEN 1 ELSE 0 END), 0) AS guest_wins
    FROM battle_room_series_games_v1
    WHERE room_code = ?1 AND round_number = ?2 AND status = 'settled_result_ready'`,
    session.roomCode,
    round,
  );
  const hostWins = Number(counts?.host_wins || 0);
  const guestWins = Number(counts?.guest_wins || 0);
  const complete = hostWins >= 4 || guestWins >= 4;
  const reconciledSeries = await first(
    database,
    `UPDATE battle_room_series_v1 SET
      host_game_wins = ?1,
      guest_game_wins = ?2,
      status = CASE WHEN ?3 = 1 THEN 'complete' ELSE status END,
      completed_at = CASE WHEN ?3 = 1 THEN COALESCE(completed_at, ?4) ELSE completed_at END,
      updated_at = ?4
    WHERE room_code = ?5 AND round_number = ?6 AND status IN ('active', 'complete')
    RETURNING status, host_game_wins, guest_game_wins`,
    hostWins,
    guestWins,
    complete ? 1 : 0,
    nowSeconds,
    session.roomCode,
    round,
  );
  const persistedComplete = reconciledSeries?.status === "complete"
    && Number(reconciledSeries.host_game_wins) === hostWins
    && Number(reconciledSeries.guest_game_wins) === guestWins;
  if (complete && persistedComplete) {
    const decisiveGame = await first(
      database,
      `SELECT host_revealed_at, guest_revealed_at
      FROM battle_room_series_games_v1
      WHERE room_code = ?1 AND round_number = ?2 AND status = 'settled_result_ready'
      ORDER BY game_number DESC LIMIT 1`,
      session.roomCode,
      round,
    );
    if (!decisiveGame?.host_revealed_at || !decisiveGame?.guest_revealed_at) {
      return { hostWins, guestWins, complete };
    }
    const winner = hostWins >= 4 ? "host" : "guest";
    const scoreColumn = winner === "host" ? "host_score" : "guest_score";
    await run(
      database,
      `UPDATE battle_rooms_v3 SET
        ${scoreColumn} = ${scoreColumn} + 1,
        scored_round = ?1,
        round_winner = ?2,
        expires_at = ?3
      WHERE room_code = ?4 AND protocol_version = ?5 AND round_number = ?1
        AND scored_round < ?1 AND expires_at > ?6`,
      round,
      winner,
      nowSeconds + BATTLE_ROOM_STRATEGY_TTL_SECONDS,
      session.roomCode,
      BATTLE_ROOM_STRATEGY_PROTOCOL,
      nowSeconds,
    );
    session.row[scoreColumn] = Number(session.row[scoreColumn] || 0) + 1;
    session.row.scored_round = round;
    session.row.round_winner = winner;
  }
  return { hostWins, guestWins, complete };
}

async function settleReadyGame(database, session, series, game, strategies, nowSeconds, settleGame) {
  if (hasGameResult(game)) {
    await reconcileSeriesScore(database, session, Number(series.round_number), nowSeconds);
    return game;
  }
  const gameNumber = Number(game.game_number);
  const hostRow = strategies.find(row => row.role === "host" && Number(row.game_number) === gameNumber);
  const guestRow = strategies.find(row => row.role === "guest" && Number(row.game_number) === gameNumber);
  if (!hostRow || !guestRow) return game;
  if (typeof settleGame !== "function") {
    throw new ApiError(503, "strategy_settlement_unavailable", "共享逐场结算器尚未接入。");
  }
  const gameSeed = await sha256Hex([
    session.row.match_seed,
    session.roomCode,
    series.round_number,
    gameNumber,
    hostRow.strategy_hash,
    guestRow.strategy_hash,
    BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
  ].join("|"));
  const hostStrategy = parseJson(hostRow.strategy_json, "房主策略");
  const guestStrategy = parseJson(guestRow.strategy_json, "挑战者策略");
  const lineupSnapshotHash = await sha256Hex(canonicalStrategyRoomJson({
    host: hostStrategy.lineupSnapshot,
    guest: guestStrategy.lineupSnapshot,
  }));
  await run(
    database,
    `UPDATE battle_room_series_v1 SET
      lineup_snapshot_hash = COALESCE(lineup_snapshot_hash, ?1), updated_at = ?2
    WHERE room_code = ?3 AND round_number = ?4
      AND (lineup_snapshot_hash IS NULL OR lineup_snapshot_hash = ?1)`,
    lineupSnapshotHash,
    nowSeconds,
    session.roomCode,
    Number(series.round_number),
  );
  const lockedSeries = await first(
    database,
    `SELECT lineup_snapshot_hash FROM battle_room_series_v1
    WHERE room_code = ?1 AND round_number = ?2`,
    session.roomCode,
    Number(series.round_number),
  );
  if (lockedSeries?.lineup_snapshot_hash !== lineupSnapshotHash) {
    throw new ApiError(409, "series_lineup_changed", "本轮五人快照已经锁定，不能跨场更换。");
  }
  let rawResult;
  try {
    rawResult = await settleGame({
      hostLineupCode: session.row.host_lineup_code,
      guestLineupCode: session.row.guest_lineup_code,
      seriesSeed: gameSeed,
      gameSeed,
      gameNumber,
      hostWins: Number(series.host_game_wins || 0),
      guestWins: Number(series.guest_game_wins || 0),
      hostStrategy: strategyRoomWireToSettlerStrategy(hostStrategy),
      guestStrategy: strategyRoomWireToSettlerStrategy(guestStrategy),
      settlementVersion: BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
    });
  } catch (error) {
    if (isApiError(error)) throw error;
    console.error("NBA5 strategy room settlement failed", error);
    throw new ApiError(503, "strategy_settlement_failed", "本场结算暂时失败，请重试。");
  }
  const { normalized, rawJson, publicJson } = normalizeSettlementEnvelope(rawResult);
  const resultHash = await sha256Hex(rawJson);
  const updated = await first(
    database,
    `UPDATE battle_room_series_games_v1 SET
      status = 'settled_result_ready', game_seed = ?1,
      host_lineup_json = ?2, guest_lineup_json = ?3,
      winner_role = ?4, host_score = ?5, guest_score = ?6,
      result_json = ?7, public_result_json = ?8, result_hash = ?9,
      settled_at = ?10, updated_at = ?10
    WHERE room_code = ?11 AND round_number = ?12 AND game_number = ?13
      AND result_json IS NULL
      AND status IN ('strategy_open', 'one_side_locked', 'both_sides_locked')
      AND 2 = (
        SELECT COUNT(DISTINCT role) FROM battle_room_game_strategies_v1
        WHERE room_code = ?11 AND round_number = ?12 AND game_number = ?13
      )
      AND EXISTS (
        SELECT 1 FROM battle_room_series_v1 AS series
        WHERE series.room_code = ?11 AND series.round_number = ?12
          AND series.status = 'active' AND series.current_game_number = ?13
      )
    RETURNING ${GAME_STATE_COLUMNS}`,
    gameSeed,
    canonicalStrategyRoomJson(hostStrategy.lineupSnapshot),
    canonicalStrategyRoomJson(guestStrategy.lineupSnapshot),
    normalized.winnerRole,
    normalized.score.host,
    normalized.score.guest,
    rawJson,
    publicJson,
    resultHash,
    nowSeconds,
    session.roomCode,
    Number(series.round_number),
    gameNumber,
  );
  const settled = updated || await first(
    database,
    `SELECT ${GAME_STATE_COLUMNS} FROM battle_room_series_games_v1
    WHERE room_code = ?1 AND round_number = ?2 AND game_number = ?3`,
    session.roomCode,
    Number(series.round_number),
    gameNumber,
  );
  if (!hasGameResult(settled) || !settled?.public_result_json_present) {
    const currentSeries = await first(
      database,
      `SELECT status, current_game_number FROM battle_room_series_v1
      WHERE room_code = ?1 AND round_number = ?2`,
      session.roomCode,
      Number(series.round_number),
    );
    if (currentSeries?.status === "cancelled") {
      throw new ApiError(409, "series_cancelled", "本轮已经取消，结算结果不会写入。");
    }
    throw new ApiError(409, "strategy_settlement_conflict", "本场结算状态已经变化，请重试。");
  }
  await reconcileSeriesScore(database, session, Number(series.round_number), nowSeconds);
  return settled;
}

async function recoverCurrentSettlement(database, session, nowSeconds, settleGame) {
  const state = await loadSeriesState(database, session.roomCode, Number(session.row.round_number || 1));
  if (!state.series) return state;
  if (state.series.status === "complete") {
    await reconcileSeriesScore(database, session, Number(state.series.round_number), nowSeconds);
    return loadSeriesState(database, session.roomCode, Number(state.series.round_number));
  }
  if (state.series.status !== "active") return state;
  const game = state.games.find(item => (
    Number(item.game_number) === Number(state.series.current_game_number)
  ));
  if (!game || hasGameResult(game)) {
    if (hasGameResult(game)) {
      await reconcileSeriesScore(database, session, Number(state.series.round_number), nowSeconds);
      return loadSeriesState(database, session.roomCode, Number(state.series.round_number));
    }
    return state;
  }
  const gameStrategies = state.strategies.filter(item => Number(item.game_number) === Number(game.game_number));
  if (new Set(gameStrategies.map(item => item.role)).size < 2) return state;
  await settleReadyGame(database, session, state.series, game, gameStrategies, nowSeconds, settleGame);
  return loadSeriesState(database, session.roomCode, Number(state.series.round_number));
}

export async function getBattleRoomStrategySeries(
  database,
  code,
  sessionToken,
  nowSeconds,
  { settleGame = defaultSettleStrategyRoomGame } = {},
) {
  const session = await requireStrategyRoomSession(database, code, sessionToken, nowSeconds);
  await recoverCurrentSettlement(database, session, nowSeconds, settleGame);
  return snapshotForSession(database, session);
}

export async function submitBattleRoomGameStrategy(
  database,
  code,
  gameValue,
  submission,
  nowSeconds,
  { settleGame = defaultSettleStrategyRoomGame } = {},
) {
  const gameNumber = assertGameNumber(gameValue);
  const session = await requireStrategyRoomSession(database, code, submission.sessionToken, nowSeconds);
  const round = assertCurrentRound(session, submission.round);
  let state = await loadSeriesState(database, session.roomCode, round);
  if (!state.series) throw new ApiError(409, "series_not_started", "双方准备开始后才能提交策略。");
  if (state.series.status === "cancelled") throw new ApiError(409, "series_cancelled", "本轮已经取消。");
  const game = state.games.find(item => Number(item.game_number) === gameNumber);
  if (!game) throw new ApiError(409, "game_not_open", "本场策略尚未开放。");

  const ownLineupCode = session.row[session.role + "_lineup_code"];
  const opponent = session.role === "host" ? "guest" : "host";
  assertStrategyLineupContract(submission, {
    ownLineupCode,
    opponentLineupCode: session.row[opponent + "_lineup_code"],
    gameNumber,
  });
  assertCanonicalStrategyReferences(submission, ownLineupCode, session.row[opponent + "_lineup_code"], gameNumber);
  const strategy = persistedStrategy(submission);
  const strategyJson = canonicalStrategyRoomJson(strategy);
  const strategyHash = await sha256Hex(strategyJson);
  const existing = state.strategies.find(item => (
    Number(item.game_number) === gameNumber && item.role === session.role
  ));
  if (existing) {
    if (existing.request_id === submission.requestId && existing.strategy_hash !== strategyHash) {
      throw new ApiError(409, "idempotency_conflict", "同一策略请求标识已经对应另一份内容。");
    }
    if (existing.strategy_hash !== strategyHash) {
      throw new ApiError(409, "strategy_locked", "本场策略已经锁定，不能再次修改。");
    }
    if (hasGameResult(game) || state.series.status === "complete"
      || Number(state.series.current_game_number) !== gameNumber) {
      return { ...(await snapshotForSession(database, session)), idempotent: true };
    }
  } else if (state.series.status === "complete") {
    throw new ApiError(409, "series_complete", "本轮已经结束。");
  } else if (state.series.status !== "active" || Number(state.series.current_game_number) !== gameNumber) {
    throw new ApiError(409, "game_not_current", "请求场次不是当前比赛，请刷新后重试。");
  } else if (hasGameResult(game)) {
    throw new ApiError(409, "strategy_locked", "本场策略已经结算，不能追加或修改策略。");
  } else {
    await run(
      database,
      `INSERT INTO battle_room_game_strategies_v1 (
        room_code, round_number, game_number, role, request_id,
        strategy_json, strategy_hash, submission_source, submitted_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(room_code, round_number, game_number, role) DO NOTHING`,
      session.roomCode,
      round,
      gameNumber,
      session.role,
      submission.requestId,
      strategyJson,
      strategyHash,
      submission.submissionSource,
      nowSeconds,
    );
  }
  const locked = await first(
    database,
    `SELECT * FROM battle_room_game_strategies_v1
    WHERE room_code = ?1 AND round_number = ?2 AND game_number = ?3 AND role = ?4`,
    session.roomCode,
    round,
    gameNumber,
    session.role,
  );
  if (!locked) throw new ApiError(409, "strategy_lock_conflict", "本场策略未能锁定，请重试。");
  if (locked.request_id === submission.requestId && locked.strategy_hash !== strategyHash) {
    throw new ApiError(409, "idempotency_conflict", "同一策略请求标识已经对应另一份内容。");
  }
  if (locked.strategy_hash !== strategyHash) {
    throw new ApiError(409, "strategy_locked", "本场策略已经锁定，不能再次修改。");
  }
  await run(
    database,
    `UPDATE battle_room_series_games_v1 SET
      status = CASE
        WHEN (SELECT COUNT(*) FROM battle_room_game_strategies_v1
          WHERE room_code = ?1 AND round_number = ?2 AND game_number = ?3) >= 2
          THEN 'both_sides_locked'
        ELSE 'one_side_locked'
      END,
      updated_at = ?4
    WHERE room_code = ?1 AND round_number = ?2 AND game_number = ?3 AND result_json IS NULL`,
    session.roomCode,
    round,
    gameNumber,
    nowSeconds,
  );
  state = await loadSeriesState(database, session.roomCode, round);
  const updatedGame = state.games.find(item => Number(item.game_number) === gameNumber);
  const gameStrategies = state.strategies.filter(item => Number(item.game_number) === gameNumber);
  if (new Set(gameStrategies.map(item => item.role)).size === 2) {
    await settleReadyGame(database, session, state.series, updatedGame, gameStrategies, nowSeconds, settleGame);
  }
  const snapshot = await snapshotForSession(database, session);
  return { ...snapshot, idempotent: Boolean(existing) };
}

export async function revealBattleRoomGame(
  database,
  code,
  gameValue,
  submission,
  nowSeconds,
  { settleGame = defaultSettleStrategyRoomGame } = {},
) {
  const gameNumber = assertGameNumber(gameValue);
  const session = await requireStrategyRoomSession(database, code, submission.sessionToken, nowSeconds);
  const round = assertCurrentRound(session, submission.round);
  await recoverCurrentSettlement(database, session, nowSeconds, settleGame);
  const game = await first(
    database,
    `SELECT ${GAME_STATE_COLUMNS} FROM battle_room_series_games_v1
    WHERE room_code = ?1 AND round_number = ?2 AND game_number = ?3`,
    session.roomCode,
    round,
    gameNumber,
  );
  if (!game) throw new ApiError(404, "game_not_found", "没有找到这场比赛。");
  if (!hasGameResult(game) || !game.public_result_json_present) {
    throw new ApiError(409, "result_not_ready", "双方锁定策略后才能开始模拟。");
  }
  const revealColumn = session.role + "_revealed_at";
  await run(
    database,
    `UPDATE battle_room_series_games_v1 SET
      ${revealColumn} = COALESCE(${revealColumn}, ?1), updated_at = ?1
    WHERE room_code = ?2 AND round_number = ?3 AND game_number = ?4
      AND status = 'settled_result_ready'`,
    nowSeconds,
    session.roomCode,
    round,
    gameNumber,
  );
  await reconcileSeriesScore(database, session, round, nowSeconds);
  return snapshotForSession(database, session);
}

export async function markBattleRoomGameNextReady(database, code, gameValue, submission, nowSeconds) {
  const gameNumber = assertGameNumber(gameValue);
  const session = await requireStrategyRoomSession(database, code, submission.sessionToken, nowSeconds);
  const round = assertCurrentRound(session, submission.round);
  let state = await loadSeriesState(database, session.roomCode, round);
  if (!state.series) throw new ApiError(409, "series_not_started", "本轮尚未开始。");
  if (Number(state.series.current_game_number) > gameNumber) {
    const previous = state.games.find(item => Number(item.game_number) === gameNumber);
    if (previous?.[session.role + "_next_ready_at"]) {
      return { ...(await snapshotForSession(database, session)), idempotent: true };
    }
  }
  const requestedGame = state.games.find(item => Number(item.game_number) === gameNumber);
  if (Number(state.series.current_game_number) === gameNumber
    && hasGameResult(requestedGame) && !requestedGame[session.role + "_revealed_at"]) {
    throw new ApiError(409, "result_not_revealed", "请先开始模拟并查看本场结果。");
  }
  if (state.series.status === "cancelled") throw new ApiError(409, "series_cancelled", "本轮已经取消。");
  if (state.series.status === "complete") throw new ApiError(409, "series_complete", "本轮已经结束，不会再创建下一场。");
  if (Number(state.series.current_game_number) !== gameNumber) {
    throw new ApiError(409, "game_not_current", "请求场次不是当前比赛，请刷新后重试。");
  }
  const game = requestedGame;
  if (!hasGameResult(game)) throw new ApiError(409, "result_not_ready", "本场结算后才能准备下一场。");
  if (!game[session.role + "_revealed_at"]) {
    throw new ApiError(409, "result_not_revealed", "请先开始模拟并查看本场结果。");
  }
  const readyColumn = session.role + "_next_ready_at";
  await run(
    database,
    `UPDATE battle_room_series_games_v1 SET
      ${readyColumn} = COALESCE(${readyColumn}, ?1), updated_at = ?1
    WHERE room_code = ?2 AND round_number = ?3 AND game_number = ?4
      AND status = 'settled_result_ready'`,
    nowSeconds,
    session.roomCode,
    round,
    gameNumber,
  );
  await reconcileSeriesScore(database, session, round, nowSeconds);
  state = await loadSeriesState(database, session.roomCode, round);
  if (state.series.status === "complete") {
    throw new ApiError(409, "series_complete", "本轮已经结束，不会再创建下一场。");
  }
  const refreshed = state.games.find(item => Number(item.game_number) === gameNumber);
  if (refreshed.host_next_ready_at && refreshed.guest_next_ready_at) {
    const nextGame = gameNumber + 1;
    if (nextGame > 7) throw new ApiError(409, "series_game_limit", "七场已经结束，不会创建 G8。");
    await run(
      database,
      `INSERT INTO battle_room_series_games_v1 (
        room_code, round_number, game_number, status, settlement_version, created_at, updated_at
      ) VALUES (?1, ?2, ?3, 'strategy_open', ?4, ?5, ?5)
      ON CONFLICT(room_code, round_number, game_number) DO NOTHING`,
      session.roomCode,
      round,
      nextGame,
      BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
      nowSeconds,
    );
    await run(
      database,
      `UPDATE battle_room_series_v1 SET current_game_number = ?1, updated_at = ?2
      WHERE room_code = ?3 AND round_number = ?4 AND status = 'active'
        AND current_game_number = ?5
        AND EXISTS (
          SELECT 1 FROM battle_room_series_games_v1
          WHERE room_code = ?3 AND round_number = ?4 AND game_number = ?5
            AND host_next_ready_at IS NOT NULL AND guest_next_ready_at IS NOT NULL
        )`,
      nextGame,
      nowSeconds,
      session.roomCode,
      round,
      gameNumber,
    );
  }
  return snapshotForSession(database, session);
}

export async function cancelBattleRoomStrategySeries(database, code, submission, nowSeconds) {
  const session = await requireStrategyRoomSession(database, code, submission.sessionToken, nowSeconds);
  const round = assertCurrentRound(session, submission.round);
  if (session.row.status !== "complete"
    || !session.row.host_lineup_code || !session.row.guest_lineup_code || !session.row.match_seed) {
    throw new ApiError(409, "lineups_not_locked", "双方锁定阵容后才能取消逐场系列赛。");
  }
  const series = await first(
    database,
    "SELECT * FROM battle_room_series_v1 WHERE room_code = ?1 AND round_number = ?2",
    session.roomCode,
    round,
  );
  if (!series) {
    throw new ApiError(409, "series_not_started", "逐场系列赛尚未开始，取消不会创建新记录。");
  }
  if (series.status === "complete") {
    const decisive = await first(
      database,
      `SELECT ${GAME_STATE_COLUMNS} FROM battle_room_series_games_v1
      WHERE room_code = ?1 AND round_number = ?2 AND game_number = ?3`,
      session.roomCode,
      round,
      Number(series.current_game_number),
    );
    if (hasGameResult(decisive) && !decisive[session.role + "_revealed_at"]) {
      throw new ApiError(409, "result_not_revealed", "请先开始模拟并查看本场结果。");
    }
    throw new ApiError(409, "series_complete", "已经完成的系列赛不能取消。");
  }
  await run(
    database,
    `UPDATE battle_room_series_v1 SET
      status = 'cancelled', cancelled_by = COALESCE(cancelled_by, ?1),
      cancelled_at = COALESCE(cancelled_at, ?2), updated_at = ?2
    WHERE room_code = ?3 AND round_number = ?4 AND status IN ('waiting_start', 'active')`,
    session.role,
    nowSeconds,
    session.roomCode,
    round,
  );
  return snapshotForSession(database, session);
}
