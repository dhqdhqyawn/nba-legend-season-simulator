import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../_lib/errors.mjs";
import {
  BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
  cancelBattleRoomStrategySeries,
  canonicalStrategyRoomJson,
  getBattleRoomStrategySeries,
  projectStrategyRoomPublicResult,
  submitBattleRoomGameStrategy,
} from "../_lib/battle-room-strategy-series.mjs";
import {
  BATTLE_ROOM_GAME_RESULT_SCHEMA,
  BATTLE_ROOM_STRATEGY_SCHEMA,
  normalizeStrategyRoomSubmission,
} from "../_lib/battle-room-strategy-validation.mjs";
import { BATTLE_ROOM_STRATEGY_PROTOCOL } from "../_lib/battle-rooms-validation.mjs";
import { sha256Hex } from "../_lib/security.mjs";

const ROOM_CODE = "ABCD2345";
const HOST_TOKEN = "23456789234567892345678923456789";
const GUEST_TOKEN = "ABCDEFGHABCDEFGHABCDEFGHABCDEFGH";
const LINEUP_CODE = "NBA5-S1-AXqWkMj_a8IC9_zHFh9P7BDMERnZUg_evw";
const LINEUP = Object.freeze([
  "Jrue Holiday|Bucks|2020-21 Title Stopper",
  "Kawhi Leonard|Spurs|2016-17 Two-Way Peak",
  "Gerald Wallace|Hornets|2005-06 Rim Protector",
  "LaMarcus Aldridge|Trail Blazers|2014-15 Midpost Star",
  "Anderson Varejao|Cavaliers|2012-13 Glass Cleaner",
]);
const NOW = 1_000;

const copy = value => value == null ? null : structuredClone(value);
const compactSql = sql => String(sql).replace(/\s+/g, " ").trim();
const runResult = changes => ({ success: true, meta: { changes } });

function resultEnvelope(gameNumber, winnerRole = "host") {
  const hostWins = winnerRole === "host";
  return {
    schemaVersion: BATTLE_ROOM_GAME_RESULT_SCHEMA,
    settlementVersion: BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
    winnerRole,
    score: hostWins ? { host: 101, guest: 97 } : { host: 97, guest: 101 },
    game: {
      number: gameNumber,
      homeTeamId: "host",
      winnerId: winnerRole,
      pace: 95,
      teamAScore: hostWins ? 101 : 97,
      teamBScore: hostWins ? 97 : 101,
      teamABox: { teamId: "host", opponentId: "guest", players: [], totals: {} },
      teamBBox: { teamId: "guest", opponentId: "host", players: [], totals: {} },
    },
  };
}

async function automaticSubmission(sessionToken, requestId, gameNumber = 1) {
  return normalizeStrategyRoomSubmission({
    schemaVersion: BATTLE_ROOM_STRATEGY_SCHEMA,
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
    sessionToken,
    round: 1,
    requestId,
    submissionSource: "automatic",
    lineupSnapshot: [...LINEUP],
    offense: {
      primaryPlan: null,
      secondaryPlan: null,
      primaryAttackerId: null,
      secondaryAttackerId: null,
    },
    defense: {
      primaryPlan: null,
      secondaryPlan: null,
      focusTargetId: null,
      leadDefenderId: null,
      rimProtectorId: null,
    },
    clientGameNumber: gameNumber,
  });
}

async function strategyRow(role, submission, gameNumber = 1) {
  const persisted = {
    schemaVersion: submission.schemaVersion,
    submissionSource: submission.submissionSource,
    lineupSnapshot: submission.lineupSnapshot,
    offense: submission.offense,
    defense: submission.defense,
  };
  const strategyJson = canonicalStrategyRoomJson(persisted);
  return {
    room_code: ROOM_CODE,
    round_number: 1,
    game_number: gameNumber,
    role,
    request_id: submission.requestId,
    strategy_json: strategyJson,
    strategy_hash: await sha256Hex(strategyJson),
    submission_source: submission.submissionSource,
    submitted_at: NOW - 10,
  };
}

async function baseRoom(overrides = {}) {
  return {
    room_code: ROOM_CODE,
    status: "complete",
    room_type: "fair_pack",
    card_pool_key: "all",
    round_number: 1,
    host_score: 0,
    guest_score: 0,
    scored_round: 0,
    round_winner: null,
    host_name: "房主",
    host_token_hash: await sha256Hex(HOST_TOKEN),
    host_lineup_code: LINEUP_CODE,
    host_ready_at: NOW - 40,
    host_pack_count: 1,
    host_rematch_mode: null,
    guest_name: "挑战者",
    guest_token_hash: await sha256Hex(GUEST_TOKEN),
    guest_lineup_code: LINEUP_CODE,
    guest_ready_at: NOW - 30,
    guest_pack_count: 1,
    guest_rematch_mode: null,
    protocol_version: BATTLE_ROOM_STRATEGY_PROTOCOL,
    match_seed: "server-hidden-series-seed",
    created_at: NOW - 100,
    joined_at: NOW - 80,
    started_at: NOW - 20,
    expires_at: NOW + 4_000,
    ...overrides,
  };
}

function baseSeries(overrides = {}) {
  return {
    room_code: ROOM_CODE,
    round_number: 1,
    protocol_version: BATTLE_ROOM_STRATEGY_PROTOCOL,
    status: "active",
    current_game_number: 1,
    host_game_wins: 0,
    guest_game_wins: 0,
    lineup_snapshot_hash: null,
    settlement_version: BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
    host_start_ready_at: NOW - 19,
    guest_start_ready_at: NOW - 18,
    cancelled_by: null,
    created_at: NOW - 20,
    updated_at: NOW - 18,
    completed_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

function baseGame(gameNumber = 1, overrides = {}) {
  return {
    room_code: ROOM_CODE,
    round_number: 1,
    game_number: gameNumber,
    status: "strategy_open",
    game_seed: null,
    host_lineup_json: null,
    guest_lineup_json: null,
    winner_role: null,
    host_score: null,
    guest_score: null,
    result_json: null,
    public_result_json: null,
    result_hash: null,
    settlement_version: BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
    settled_at: null,
    host_revealed_at: null,
    guest_revealed_at: null,
    host_next_ready_at: null,
    guest_next_ready_at: null,
    created_at: NOW - 17 + gameNumber,
    updated_at: NOW - 17 + gameNumber,
    ...overrides,
  };
}

class StatefulD1 {
  constructor({ room, series, games = [], strategies = [] }) {
    this.room = copy(room);
    this.series = copy(series);
    this.games = copy(games);
    this.strategies = copy(strategies);
    this.outerScoreWrites = 0;
    this.bulkGameResultReads = 0;
    this.rawGameResultReads = 0;
    this.singleGameResultReads = 0;
  }

  prepare(sql) {
    const database = this;
    const normalized = compactSql(sql);
    return {
      bind(...bindings) {
        return {
          first: () => database.execute("first", normalized, bindings),
          all: () => database.execute("all", normalized, bindings),
          run: () => database.execute("run", normalized, bindings),
        };
      },
    };
  }

  game(gameNumber) {
    return this.games.find(row => Number(row.game_number) === Number(gameNumber)) || null;
  }

  gameStrategies(gameNumber) {
    return this.strategies.filter(row => Number(row.game_number) === Number(gameNumber));
  }

  gameState(row) {
    if (!row) return null;
    const { result_json: resultJson, public_result_json: publicResultJson, ...state } = row;
    return {
      ...state,
      result_json_present: resultJson == null ? 0 : 1,
      public_result_json_present: publicResultJson == null ? 0 : 1,
    };
  }

  execute(kind, sql, bindings) {
    if (sql === "SELECT * FROM battle_rooms_v3 WHERE room_code = ?1") {
      return copy(this.room?.room_code === bindings[0] ? this.room : null);
    }

    if (sql.startsWith("UPDATE battle_rooms_v3 SET expires_at = ?1")) {
      const [renewedUntil, roomCode, nowSeconds, writeThreshold] = bindings;
      const eligible = this.room?.room_code === roomCode
        && Number(this.room.expires_at) > Number(nowSeconds)
        && Number(this.room.expires_at) < Number(writeThreshold);
      if (eligible) this.room.expires_at = Number(renewedUntil);
      return eligible ? { expires_at: this.room.expires_at } : null;
    }

    if (sql === "SELECT * FROM battle_room_series_v1 WHERE room_code = ?1 AND round_number = ?2") {
      return copy(this.series?.room_code === bindings[0]
        && Number(this.series.round_number) === Number(bindings[1]) ? this.series : null);
    }

    if (sql.startsWith("SELECT room_code, round_number, game_number, status, game_seed")
      && sql.includes("result_json_present") && sql.includes("ORDER BY game_number")) {
      const [roomCode, round] = bindings;
      return { results: copy(this.games.filter(row => row.room_code === roomCode
        && Number(row.round_number) === Number(round)).sort((left, right) => (
        Number(left.game_number) - Number(right.game_number)
      )).map(row => this.gameState(row))) };
    }

    if (sql.startsWith("SELECT * FROM battle_room_series_games_v1")
      && sql.includes("ORDER BY game_number")) {
      this.bulkGameResultReads += 1;
      const [roomCode, round] = bindings;
      return { results: copy(this.games.filter(row => row.room_code === roomCode
        && Number(row.round_number) === Number(round)).sort((left, right) => (
        Number(left.game_number) - Number(right.game_number)
      ))) };
    }

    if (sql.startsWith("SELECT game_number, result_json FROM battle_room_series_games_v1")) {
      this.rawGameResultReads += 1;
      const [roomCode, round] = bindings;
      const game = this.games.filter(row => row.room_code === roomCode
        && Number(row.round_number) === Number(round)
        && row.result_json != null && row.public_result_json == null)
        .sort((left, right) => Number(left.game_number) - Number(right.game_number))[0];
      return copy(game ? { game_number: game.game_number, result_json: game.result_json } : null);
    }

    if (sql.startsWith("SELECT public_result_json FROM battle_room_series_games_v1")) {
      this.singleGameResultReads += 1;
      const [roomCode, round, gameNumber] = bindings;
      const game = this.game(gameNumber);
      return copy(game?.room_code === roomCode && Number(game.round_number) === Number(round)
        ? { public_result_json: game.public_result_json }
        : null);
    }

    if (sql.startsWith("UPDATE battle_room_series_games_v1 SET public_result_json = ?1")) {
      const [publicResultJson, roomCode, round, gameNumber] = bindings;
      const game = this.game(gameNumber);
      const eligible = game?.room_code === roomCode
        && Number(game.round_number) === Number(round)
        && game.result_json != null && game.public_result_json == null;
      if (eligible) game.public_result_json = publicResultJson;
      return runResult(eligible ? 1 : 0);
    }

    if (sql.startsWith("SELECT * FROM battle_room_game_strategies_v1")
      && sql.includes("ORDER BY game_number, role")) {
      const [roomCode, round] = bindings;
      return { results: copy(this.strategies.filter(row => row.room_code === roomCode
        && Number(row.round_number) === Number(round)).sort((left, right) => (
        Number(left.game_number) - Number(right.game_number) || left.role.localeCompare(right.role)
      ))) };
    }

    if (sql.startsWith("INSERT INTO battle_room_game_strategies_v1")) {
      const [roomCode, round, gameNumber, role, requestId, strategyJson,
        strategyHash, submissionSource, submittedAt] = bindings;
      const exists = this.strategies.some(row => row.room_code === roomCode
        && Number(row.round_number) === Number(round)
        && Number(row.game_number) === Number(gameNumber) && row.role === role);
      if (!exists) {
        this.strategies.push({
          room_code: roomCode,
          round_number: Number(round),
          game_number: Number(gameNumber),
          role,
          request_id: requestId,
          strategy_json: strategyJson,
          strategy_hash: strategyHash,
          submission_source: submissionSource,
          submitted_at: Number(submittedAt),
        });
      }
      return runResult(exists ? 0 : 1);
    }

    if (sql.startsWith("SELECT * FROM battle_room_game_strategies_v1")
      && sql.includes("game_number = ?3 AND role = ?4")) {
      const [roomCode, round, gameNumber, role] = bindings;
      return copy(this.strategies.find(row => row.room_code === roomCode
        && Number(row.round_number) === Number(round)
        && Number(row.game_number) === Number(gameNumber) && row.role === role) || null);
    }

    if (sql.startsWith("UPDATE battle_room_series_games_v1 SET status = CASE")) {
      const [roomCode, round, gameNumber, updatedAt] = bindings;
      const game = this.game(gameNumber);
      if (!game || game.room_code !== roomCode || Number(game.round_number) !== Number(round)
        || game.result_json != null) return runResult(0);
      game.status = new Set(this.gameStrategies(gameNumber).map(row => row.role)).size >= 2
        ? "both_sides_locked" : "one_side_locked";
      game.updated_at = Number(updatedAt);
      return runResult(1);
    }

    if (sql.startsWith("UPDATE battle_room_series_v1 SET lineup_snapshot_hash")) {
      const [lineupHash, updatedAt, roomCode, round] = bindings;
      const eligible = this.series?.room_code === roomCode
        && Number(this.series.round_number) === Number(round)
        && (this.series.lineup_snapshot_hash == null || this.series.lineup_snapshot_hash === lineupHash);
      if (eligible) {
        this.series.lineup_snapshot_hash ??= lineupHash;
        this.series.updated_at = Number(updatedAt);
      }
      return runResult(eligible ? 1 : 0);
    }

    if (sql.startsWith("SELECT lineup_snapshot_hash FROM battle_room_series_v1")) {
      return copy(this.series ? { lineup_snapshot_hash: this.series.lineup_snapshot_hash } : null);
    }

    if (sql.startsWith("UPDATE battle_room_series_games_v1 SET status = 'settled_result_ready'")) {
      const [gameSeed, hostLineupJson, guestLineupJson, winnerRole, hostScore, guestScore,
        resultJson, publicResultJson, resultHash, settledAt, roomCode, round, gameNumber] = bindings;
      const game = this.game(gameNumber);
      const roles = new Set(this.gameStrategies(gameNumber).map(row => row.role));
      const eligible = game?.room_code === roomCode
        && Number(game.round_number) === Number(round)
        && game.result_json == null
        && ["strategy_open", "one_side_locked", "both_sides_locked"].includes(game.status)
        && roles.size === 2
        && this.series?.status === "active"
        && Number(this.series.current_game_number) === Number(gameNumber);
      if (!eligible) return null;
      Object.assign(game, {
        status: "settled_result_ready",
        game_seed: gameSeed,
        host_lineup_json: hostLineupJson,
        guest_lineup_json: guestLineupJson,
        winner_role: winnerRole,
        host_score: Number(hostScore),
        guest_score: Number(guestScore),
        result_json: resultJson,
        public_result_json: publicResultJson,
        result_hash: resultHash,
        settled_at: Number(settledAt),
        updated_at: Number(settledAt),
      });
      return copy(this.gameState(game));
    }

    if (sql.startsWith("SELECT room_code, round_number, game_number, status, game_seed")
      && sql.includes("game_number = ?3") && !sql.includes("ORDER BY")) {
      const [roomCode, round, gameNumber] = bindings;
      const game = this.game(gameNumber);
      return copy(game?.room_code === roomCode && Number(game.round_number) === Number(round)
        ? this.gameState(game)
        : null);
    }

    if (sql.startsWith("SELECT * FROM battle_room_series_games_v1")
      && sql.includes("game_number = ?3") && !sql.includes("ORDER BY")) {
      const [roomCode, round, gameNumber] = bindings;
      const game = this.game(gameNumber);
      return copy(game?.room_code === roomCode && Number(game.round_number) === Number(round) ? game : null);
    }

    if (sql.startsWith("SELECT status, current_game_number FROM battle_room_series_v1")) {
      return copy(this.series ? {
        status: this.series.status,
        current_game_number: this.series.current_game_number,
      } : null);
    }

    if (sql.startsWith("SELECT COALESCE(SUM(CASE WHEN winner_role = 'host'")) {
      const [roomCode, round] = bindings;
      const settled = this.games.filter(row => row.room_code === roomCode
        && Number(row.round_number) === Number(round) && row.status === "settled_result_ready");
      return {
        host_wins: settled.filter(row => row.winner_role === "host").length,
        guest_wins: settled.filter(row => row.winner_role === "guest").length,
      };
    }

    if (sql.startsWith("UPDATE battle_room_series_v1 SET host_game_wins = ?1")) {
      const [hostWins, guestWins, complete, updatedAt, roomCode, round] = bindings;
      const eligible = this.series?.room_code === roomCode
        && Number(this.series.round_number) === Number(round)
        && ["active", "complete"].includes(this.series.status);
      if (!eligible) return null;
      this.series.host_game_wins = Number(hostWins);
      this.series.guest_game_wins = Number(guestWins);
      if (Number(complete) === 1) {
        this.series.status = "complete";
        this.series.completed_at ??= Number(updatedAt);
      }
      this.series.updated_at = Number(updatedAt);
      return {
        status: this.series.status,
        host_game_wins: this.series.host_game_wins,
        guest_game_wins: this.series.guest_game_wins,
      };
    }

    if (sql.startsWith("SELECT host_revealed_at, guest_revealed_at")) {
      const [roomCode, round] = bindings;
      const decisive = this.games.filter(row => row.room_code === roomCode
        && Number(row.round_number) === Number(round) && row.status === "settled_result_ready")
        .sort((left, right) => Number(right.game_number) - Number(left.game_number))[0];
      return copy(decisive ? {
        host_revealed_at: decisive.host_revealed_at,
        guest_revealed_at: decisive.guest_revealed_at,
      } : null);
    }

    if (sql.startsWith("UPDATE battle_rooms_v3 SET host_score = host_score + 1")
      || sql.startsWith("UPDATE battle_rooms_v3 SET guest_score = guest_score + 1")) {
      const [round, winner, renewedUntil, roomCode, protocolVersion, nowSeconds] = bindings;
      const eligible = this.room?.room_code === roomCode
        && this.room.protocol_version === protocolVersion
        && Number(this.room.round_number) === Number(round)
        && Number(this.room.scored_round) < Number(round)
        && Number(this.room.expires_at) > Number(nowSeconds);
      if (eligible) {
        const scoreColumn = winner === "host" ? "host_score" : "guest_score";
        this.room[scoreColumn] = Number(this.room[scoreColumn]) + 1;
        this.room.scored_round = Number(round);
        this.room.round_winner = winner;
        this.room.expires_at = Number(renewedUntil);
        this.outerScoreWrites += 1;
      }
      return runResult(eligible ? 1 : 0);
    }

    if (sql.startsWith("UPDATE battle_room_series_v1 SET status = 'cancelled'")) {
      const [role, cancelledAt, roomCode, round] = bindings;
      const eligible = this.series?.room_code === roomCode
        && Number(this.series.round_number) === Number(round)
        && ["waiting_start", "active"].includes(this.series.status);
      if (eligible) {
        this.series.status = "cancelled";
        this.series.cancelled_by ??= role;
        this.series.cancelled_at ??= Number(cancelledAt);
        this.series.updated_at = Number(cancelledAt);
      }
      return runResult(eligible ? 1 : 0);
    }

    throw new Error(`Unsupported fake D1 ${kind}: ${sql}`);
  }
}

test("cancel wins against an in-flight second-strategy settlement and retry cannot revive it", async () => {
  const hostSubmission = await automaticSubmission(HOST_TOKEN, "host-race-request-01");
  const guestSubmission = await automaticSubmission(GUEST_TOKEN, "guest-race-request-1");
  const database = new StatefulD1({
    room: await baseRoom(),
    series: baseSeries(),
    games: [baseGame(1, { status: "one_side_locked" })],
    strategies: [await strategyRow("host", hostSubmission)],
  });

  let enterSettlement;
  let releaseSettlement;
  const settlementEntered = new Promise(resolve => { enterSettlement = resolve; });
  const settlementGate = new Promise(resolve => { releaseSettlement = resolve; });
  let settlementCalls = 0;
  const delayedSettler = async input => {
    settlementCalls += 1;
    assert.equal(input.gameNumber, 1);
    enterSettlement();
    await settlementGate;
    return resultEnvelope(1, "host");
  };

  const inFlight = submitBattleRoomGameStrategy(
    database,
    ROOM_CODE,
    1,
    guestSubmission,
    NOW,
    { settleGame: delayedSettler },
  );
  await settlementEntered;

  const cancelled = await cancelBattleRoomStrategySeries(database, ROOM_CODE, {
    sessionToken: HOST_TOKEN,
    round: 1,
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
  }, NOW + 1);
  assert.equal(cancelled.phase, "cancelled");
  assert.equal(database.series.status, "cancelled");

  releaseSettlement();
  await assert.rejects(inFlight, error => (
    error instanceof ApiError && error.code === "series_cancelled"
  ));

  assert.equal(settlementCalls, 1);
  assert.equal(database.game(1).result_json, null);
  assert.equal(database.game(1).winner_role, null);
  assert.equal(database.room.host_score, 0);
  assert.equal(database.room.guest_score, 0);
  assert.equal(database.room.scored_round, 0);
  assert.equal(database.outerScoreWrites, 0);

  const reconnected = await getBattleRoomStrategySeries(
    database,
    ROOM_CODE,
    GUEST_TOKEN,
    NOW + 2,
    { settleGame: () => { throw new Error("cancelled GET must not settle"); } },
  );
  assert.equal(reconnected.phase, "cancelled");
  assert.equal(reconnected.series.status, "cancelled");

  let retrySettlerCalls = 0;
  await assert.rejects(() => submitBattleRoomGameStrategy(
    database,
    ROOM_CODE,
    1,
    guestSubmission,
    NOW + 3,
    { settleGame: () => { retrySettlerCalls += 1; return resultEnvelope(1); } },
  ), error => error instanceof ApiError && error.code === "series_cancelled");
  assert.equal(retrySettlerCalls, 0);
  assert.equal(database.game(1).result_json, null);
  assert.equal(database.series.status, "cancelled");
});

test("GET repairs a completed revealed series outer score once after an interrupted write", async () => {
  const resultJson = canonicalStrategyRoomJson(resultEnvelope(4, "host"));
  const games = await Promise.all(Array.from({ length: 4 }, async (_value, index) => {
    const gameNumber = index + 1;
    const json = canonicalStrategyRoomJson(resultEnvelope(gameNumber, "host"));
    return baseGame(gameNumber, {
      status: "settled_result_ready",
      game_seed: ("a".repeat(63) + gameNumber).slice(-64),
      host_lineup_json: canonicalStrategyRoomJson(LINEUP),
      guest_lineup_json: canonicalStrategyRoomJson(LINEUP),
      winner_role: "host",
      host_score: 101,
      guest_score: 97,
      result_json: gameNumber === 4 ? resultJson : json,
      public_result_json: gameNumber === 4 ? resultJson : json,
      result_hash: await sha256Hex(gameNumber === 4 ? resultJson : json),
      settled_at: NOW - 8 + gameNumber,
      host_revealed_at: NOW - 4 + gameNumber,
      guest_revealed_at: NOW - 4 + gameNumber,
    });
  }));
  const database = new StatefulD1({
    room: await baseRoom(),
    series: baseSeries({
      status: "complete",
      current_game_number: 4,
      host_game_wins: 4,
      guest_game_wins: 0,
      completed_at: NOW - 4,
    }),
    games,
  });

  const first = await getBattleRoomStrategySeries(database, ROOM_CODE, HOST_TOKEN, NOW);
  assert.equal(first.phase, "series_complete");
  assert.deepEqual(first.series.wins, { own: 4, opponent: 0, host: 4, guest: 0 });
  assert.equal(database.room.host_score, 1);
  assert.equal(database.room.guest_score, 0);
  assert.equal(database.room.scored_round, 1);
  assert.equal(database.room.round_winner, "host");
  assert.equal(database.outerScoreWrites, 1);

  const second = await getBattleRoomStrategySeries(database, ROOM_CODE, HOST_TOKEN, NOW + 1);
  assert.equal(second.phase, "series_complete");
  assert.deepEqual(second.series.wins, first.series.wins);
  assert.equal(database.room.host_score, 1);
  assert.equal(database.room.scored_round, 1);
  assert.equal(database.outerScoreWrites, 1);
});

test("GET settles strategy_open when both immutable strategy rows already exist", async () => {
  const hostSubmission = await automaticSubmission(HOST_TOKEN, "host-recover-request1");
  const guestSubmission = await automaticSubmission(GUEST_TOKEN, "guest-recover-request");
  const database = new StatefulD1({
    room: await baseRoom(),
    series: baseSeries(),
    games: [baseGame(1, { status: "strategy_open" })],
    strategies: [
      await strategyRow("host", hostSubmission),
      await strategyRow("guest", guestSubmission),
    ],
  });
  let calls = 0;
  const settleGame = () => {
    calls += 1;
    return resultEnvelope(1, "host");
  };

  const recovered = await getBattleRoomStrategySeries(
    database,
    ROOM_CODE,
    HOST_TOKEN,
    NOW,
    { settleGame },
  );
  assert.equal(recovered.phase, "result_ready");
  assert.equal(recovered.currentGame.resultReady, true);
  assert.equal(recovered.currentGame.result, null);
  assert.deepEqual(recovered.series.wins, { own: 0, opponent: 0, host: 0, guest: 0 });
  assert.equal(database.game(1).status, "settled_result_ready");
  assert.ok(database.game(1).result_json);
  assert.equal(database.series.host_game_wins, 1);
  assert.equal(calls, 1);

  await getBattleRoomStrategySeries(database, ROOM_CODE, HOST_TOKEN, NOW + 1, { settleGame });
  assert.equal(calls, 1);
  assert.equal(database.series.host_game_wins, 1);
});

test("G3 survives a failed second-strategy settlement and reconnects without bulk-reading legacy raw results", async () => {
  const submissions = await Promise.all([
    automaticSubmission(HOST_TOKEN, "host-g1-history-request", 1),
    automaticSubmission(GUEST_TOKEN, "guest-g1-history-request", 1),
    automaticSubmission(HOST_TOKEN, "host-g2-history-request", 2),
    automaticSubmission(GUEST_TOKEN, "guest-g2-history-request", 2),
    automaticSubmission(HOST_TOKEN, "host-g3-existing-request", 3),
    automaticSubmission(GUEST_TOKEN, "guest-g3-reconnect-request", 3),
  ]);
  const [hostG1, guestG1, hostG2, guestG2, hostG3, guestG3] = submissions;
  const legacyResult = (gameNumber, winnerRole) => {
    const result = resultEnvelope(gameNumber, winnerRole);
    result.game.matchupModel = {
      privateDiagnostics: "x".repeat(1_205_000),
    };
    return canonicalStrategyRoomJson(result);
  };
  const gameOneJson = legacyResult(1, "host");
  const gameTwoJson = legacyResult(2, "guest");
  assert.ok(Buffer.byteLength(gameOneJson) > 1_200_000);
  assert.ok(Buffer.byteLength(gameTwoJson) > 1_200_000);

  const settledHistoryGame = async (gameNumber, winnerRole, resultJson) => baseGame(gameNumber, {
    status: "settled_result_ready",
    game_seed: String(gameNumber).repeat(64),
    host_lineup_json: canonicalStrategyRoomJson(LINEUP),
    guest_lineup_json: canonicalStrategyRoomJson(LINEUP),
    winner_role: winnerRole,
    host_score: winnerRole === "host" ? 101 : 97,
    guest_score: winnerRole === "guest" ? 101 : 97,
    result_json: resultJson,
    public_result_json: canonicalStrategyRoomJson(projectStrategyRoomPublicResult(JSON.parse(resultJson))),
    result_hash: await sha256Hex(resultJson),
    settled_at: NOW - 30 + gameNumber,
    host_revealed_at: NOW - 25 + gameNumber,
    guest_revealed_at: NOW - 25 + gameNumber,
    host_next_ready_at: NOW - 20 + gameNumber,
    guest_next_ready_at: NOW - 20 + gameNumber,
  });
  const database = new StatefulD1({
    room: await baseRoom({ expires_at: NOW + 100 }),
    series: baseSeries({
      current_game_number: 3,
      host_game_wins: 1,
      guest_game_wins: 1,
    }),
    games: [
      await settledHistoryGame(1, "host", gameOneJson),
      await settledHistoryGame(2, "guest", gameTwoJson),
      baseGame(3, { status: "one_side_locked" }),
    ],
    strategies: await Promise.all([
      strategyRow("host", hostG1, 1),
      strategyRow("guest", guestG1, 1),
      strategyRow("host", hostG2, 2),
      strategyRow("guest", guestG2, 2),
      strategyRow("host", hostG3, 3),
    ]),
  });

  let settlementCalls = 0;
  await assert.rejects(() => submitBattleRoomGameStrategy(
    database,
    ROOM_CODE,
    3,
    guestG3,
    NOW,
    { settleGame: () => {
      settlementCalls += 1;
      throw new Error("simulated worker interruption after both locks");
    } },
  ), error => error instanceof ApiError && error.code === "strategy_settlement_failed");
  assert.equal(database.game(3).status, "both_sides_locked");
  assert.equal(database.game(3).result_json, null);
  assert.equal(database.gameStrategies(3).length, 2);
  assert.equal(database.room.expires_at, NOW + 6 * 60 * 60);

  const recovered = await getBattleRoomStrategySeries(
    database,
    ROOM_CODE,
    GUEST_TOKEN,
    NOW + 1,
    { settleGame: input => {
      settlementCalls += 1;
      const result = resultEnvelope(input.gameNumber, "host");
      result.game.matchupModel = { privateDiagnostics: "y".repeat(1_205_000) };
      return result;
    } },
  );
  assert.equal(settlementCalls, 2);
  assert.equal(recovered.phase, "result_ready");
  assert.equal(recovered.currentGame.gameNumber, 3);
  assert.equal(recovered.currentGame.resultReady, true);
  assert.equal(recovered.history.length, 2);
  assert.equal(database.bulkGameResultReads, 0);
  assert.equal(database.rawGameResultReads, 0);
  assert.equal(database.singleGameResultReads, 2);
  assert.ok(Buffer.byteLength(database.game(3).result_json) > 1_200_000);
  assert.ok(Buffer.byteLength(database.game(3).public_result_json) < 20_000);
  assert.equal(database.game(3).public_result_json.includes("matchupModel"), false);
  assert.equal(database.game(3).public_result_json.includes("privateDiagnostics"), false);
});

test("strategy storage failures remain a retryable 503 with a specific Chinese contract", async () => {
  const database = {
    prepare() {
      return {
        bind() {
          return {
            first() {
              throw new Error("D1_ERROR: query result materialization failed");
            },
          };
        },
      };
    },
  };
  await assert.rejects(
    () => getBattleRoomStrategySeries(database, ROOM_CODE, HOST_TOKEN, NOW),
    error => error instanceof ApiError
      && error.status === 503
      && error.code === "strategy_storage_unavailable"
      && error.message === "逐场房间状态暂时无法读取，请稍后重试。"
      && error.headers?.["Retry-After"] === "2",
  );
});
