import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../_lib/errors.mjs";
import {
  publicRoom,
  startBattleRoom,
  strategyRoomCardPoolKey,
  strategyRoomCardSeasonYear,
} from "../_lib/battle-rooms.mjs";
import {
  BATTLE_ROOM_PROTOCOL,
  BATTLE_ROOM_STRATEGY_PROTOCOL,
  normalizeRoomLineupSubmission,
  normalizeRoomPackSubmission,
  normalizeRoomRematchSubmission,
  normalizeRoomStartSubmission,
  normalizeRoomSubmission,
} from "../_lib/battle-rooms-validation.mjs";
import {
  BATTLE_ROOM_GAME_RESULT_SCHEMA,
  BATTLE_ROOM_STRATEGY_SCHEMA,
  assertStrategyLineupContract,
  decodeBattleLineupTokens,
  normalizeStrategyRoomAuthorization,
  normalizeStrategyRoomSubmission,
  stableBattleVersionToken,
} from "../_lib/battle-room-strategy-validation.mjs";
import {
  BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
  buildStrategyRoomViewerSnapshot,
  canonicalStrategyRoomJson,
  projectStrategyRoomPublicResult,
  strategyRoomWireToSettlerStrategy,
} from "../_lib/battle-room-strategy-series.mjs";
import { settleStrategyRoomGame } from "../_lib/nba5-strategy-room-settler.mjs";
import { sha256Hex } from "../_lib/security.mjs";

const SESSION_TOKEN = "23456789234567892345678923456789";
const LINEUP = Object.freeze([
  "Jrue Holiday|Bucks|2020-21 Title Stopper",
  "Kawhi Leonard|Spurs|2016-17 Two-Way Peak",
  "Gerald Wallace|Hornets|2005-06 Rim Protector",
  "LaMarcus Aldridge|Trail Blazers|2014-15 Midpost Star",
  "Anderson Varejao|Cavaliers|2012-13 Glass Cleaner",
]);

function writeUint32(bytes, offset, value) {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16 & 0xff;
  bytes[offset + 2] = value >>> 8 & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function checksum32(bytes, length) {
  let hash = 2166136261;
  for (let index = 0; index < length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function lineupCode(lineup = LINEUP) {
  const bytes = new Uint8Array(25);
  bytes[0] = 1;
  lineup.forEach((versionKey, index) => {
    writeUint32(bytes, 1 + index * 4, stableBattleVersionToken(versionKey));
  });
  writeUint32(bytes, 21, checksum32(bytes, 21));
  return `NBA5-S1-${Buffer.from(bytes).toString("base64url")}`;
}

function emptyStrategy(overrides = {}) {
  return {
    schemaVersion: BATTLE_ROOM_STRATEGY_SCHEMA,
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
    sessionToken: SESSION_TOKEN,
    round: 1,
    requestId: "strategy-request-0001",
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
    ...overrides,
  };
}

function roomRow(overrides = {}) {
  return {
    room_code: "ABCD2345",
    status: "complete",
    room_type: "fair_pack",
    card_pool_key: "all",
    round_number: 1,
    host_score: 0,
    guest_score: 0,
    scored_round: 0,
    round_winner: null,
    host_name: "房主",
    host_token_hash: "host-hash",
    host_lineup_code: lineupCode(),
    host_ready_at: 120,
    host_pack_count: 2,
    host_rematch_mode: "same",
    guest_name: "挑战者",
    guest_token_hash: "guest-hash",
    guest_lineup_code: lineupCode(),
    guest_ready_at: 130,
    guest_pack_count: 3,
    guest_rematch_mode: "redraft",
    protocol_version: BATTLE_ROOM_STRATEGY_PROTOCOL,
    match_seed: "hidden-series-seed",
    created_at: 100,
    joined_at: 110,
    started_at: 140,
    expires_at: 2_000,
    ...overrides,
  };
}

test("shared room setup accepts v4 while quick-only actions remain locked to 1.8", () => {
  const created = normalizeRoomSubmission({
    name: "逐场房",
    roomType: "fair_pack",
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
  }, "host");
  assert.equal(created.protocolVersion, BATTLE_ROOM_STRATEGY_PROTOCOL);
  assert.equal(normalizeRoomPackSubmission({
    sessionToken: SESSION_TOKEN,
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
    expectedPackCount: 0,
    requestId: "pack-request-0001",
  }).protocolVersion, BATTLE_ROOM_STRATEGY_PROTOCOL);
  assert.equal(normalizeRoomLineupSubmission({
    sessionToken: SESSION_TOKEN,
    lineupCode: lineupCode(),
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
  }).protocolVersion, BATTLE_ROOM_STRATEGY_PROTOCOL);
  assert.throws(() => normalizeRoomStartSubmission({
    sessionToken: SESSION_TOKEN,
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
  }), error => error instanceof ApiError && error.code === "protocol_mismatch");
  assert.deepEqual(normalizeRoomRematchSubmission({
    sessionToken: SESSION_TOKEN,
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
    mode: "same",
    round: 2,
  }), {
    sessionToken: SESSION_TOKEN,
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
    mode: "same",
    round: 2,
  });
  assert.deepEqual(normalizeRoomRematchSubmission({
    sessionToken: SESSION_TOKEN,
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
    mode: "redraft",
    round: 2,
    cardPoolKey: "historic_pre_2015",
  }), {
    sessionToken: SESSION_TOKEN,
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
    mode: "redraft",
    round: 2,
    cardPoolKey: "historic_pre_2015",
  });
  assert.throws(() => normalizeRoomPackSubmission({
    sessionToken: SESSION_TOKEN,
    protocolVersion: BATTLE_ROOM_STRATEGY_PROTOCOL,
    expectedPackCount: 0,
  }), error => error instanceof ApiError && error.code === "invalid_request_id");
});

test("v4 card-pool boundary matches the shipped H5 season-start contract", () => {
  const boundaryHistoric = {
    version: "2014-15 Boundary Card",
    availability: { endYear: 2015 },
  };
  const boundaryModern = {
    version: "2015-16 Boundary Card",
    availability: { endYear: 2016 },
  };
  assert.equal(strategyRoomCardSeasonYear(boundaryHistoric), 2014);
  assert.equal(strategyRoomCardPoolKey(boundaryHistoric), "historic_pre_2015");
  assert.equal(strategyRoomCardSeasonYear(boundaryModern), 2015);
  assert.equal(strategyRoomCardPoolKey(boundaryModern), "modern_2015_2026");
  assert.equal(strategyRoomCardPoolKey({ displayVersion: "2015-16 Fallback" }), "modern_2015_2026");
});

test("strategy validation pins enums, automatic emptiness and locked lineup tokens", () => {
  const normalized = normalizeStrategyRoomSubmission(emptyStrategy());
  assert.equal(normalized.submissionSource, "automatic");
  assert.deepEqual(
    decodeBattleLineupTokens(lineupCode()),
    LINEUP.map(stableBattleVersionToken),
  );
  assert.equal(assertStrategyLineupContract(normalized, {
    ownLineupCode: lineupCode(),
    opponentLineupCode: lineupCode(),
    gameNumber: 1,
  }), normalized);
  assert.throws(() => normalizeStrategyRoomSubmission(emptyStrategy({
    offense: {
      primaryPlan: "perimeterEngine",
      secondaryPlan: null,
      primaryAttackerId: LINEUP[1],
      secondaryAttackerId: null,
    },
  })), error => error instanceof ApiError && error.code === "automatic_strategy_not_empty");
  const focused = normalizeStrategyRoomSubmission(emptyStrategy({
    requestId: "strategy-request-0002",
    submissionSource: "manual",
    defense: {
      primaryPlan: "selectiveSwitch",
      secondaryPlan: "selectiveSwitch",
      focusTargetId: LINEUP[1],
      leadDefenderId: LINEUP[0],
      rimProtectorId: LINEUP[4],
    },
  }));
  assert.equal(focused.defense.secondaryPlan, null);
  assert.throws(() => assertStrategyLineupContract(focused, {
    ownLineupCode: lineupCode(),
    opponentLineupCode: lineupCode(),
    gameNumber: 1,
  }), error => error instanceof ApiError && error.code === "g1_focus_forbidden");
  assert.equal(assertStrategyLineupContract(focused, {
    ownLineupCode: lineupCode(),
    opponentLineupCode: lineupCode(),
    gameNumber: 2,
  }), focused);
});

test("v4 public room projection never exposes G1 lineup, seed or rematch choice", () => {
  const room = publicRoom(roomRow(), 200);
  assert.equal(room.status, "lineups_locked");
  assert.equal(room.battleMode, "coach");
  assert.equal(room.host.lineupCode, null);
  assert.equal(room.guest.lineupCode, null);
  assert.equal(room.seed, null);
  assert.equal(room.startedAt, null);
  assert.equal(room.host.rematchReady, true);
  assert.equal(room.guest.rematchReady, true);
  assert.equal("rematch" in room.host, false);

  const quick = publicRoom(roomRow({ protocol_version: BATTLE_ROOM_PROTOCOL }), 200);
  assert.equal(quick.status, "complete");
  assert.equal(quick.host.lineupCode, lineupCode());
  assert.equal(quick.seed, "hidden-series-seed");
  assert.equal(quick.host.rematch, "same");
});

test("service-layer protocol binding blocks a v4 token from calling old quick start", async () => {
  const row = roomRow({ host_token_hash: await sha256Hex(SESSION_TOKEN) });
  const database = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.startsWith("SELECT")) return { ...row };
              throw new Error("unexpected update");
            },
          };
        },
      };
    },
  };
  await assert.rejects(() => startBattleRoom(database, row.room_code, {
    sessionToken: SESSION_TOKEN,
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  }, 200), error => error instanceof ApiError && error.code === "protocol_mismatch");
});

test("viewer snapshot crops opponent strategy/result until this viewer reveals G1", () => {
  const hostStrategy = normalizeStrategyRoomSubmission(emptyStrategy());
  const guestStrategy = normalizeStrategyRoomSubmission(emptyStrategy({
    requestId: "strategy-request-guest1",
  }));
  const storedHost = {
    schemaVersion: hostStrategy.schemaVersion,
    submissionSource: hostStrategy.submissionSource,
    lineupSnapshot: hostStrategy.lineupSnapshot,
    offense: hostStrategy.offense,
    defense: hostStrategy.defense,
  };
  const storedGuest = {
    schemaVersion: guestStrategy.schemaVersion,
    submissionSource: guestStrategy.submissionSource,
    lineupSnapshot: guestStrategy.lineupSnapshot,
    offense: guestStrategy.offense,
    defense: guestStrategy.defense,
  };
  const result = {
    schemaVersion: BATTLE_ROOM_GAME_RESULT_SCHEMA,
    settlementVersion: BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
    winnerRole: "host",
    score: { host: 104, guest: 99 },
    game: {
      number: 1,
      homeTeamId: "host",
      winnerId: "host",
      pace: 96,
      teamAScore: 104,
      teamBScore: 99,
      strategy: { settlementDeltaTeamA: 0.03 },
      cpuStrategy: {},
      baseProbabilityTeamA: 0.55,
      probabilityTeamA: 0.58,
      matchupModel: { diagnostics: { expectedMatchupNet: 0.03 } },
      event: null,
      specialEvent: { id: "visible-event-1", type: "nightlife_sighting" },
      teamABox: { teamId: "host", opponentId: "guest", players: [], totals: {} },
      teamBBox: { teamId: "guest", opponentId: "host", players: [], totals: {} },
      primaryMatchupEvents: {},
      secondaryMatchupEvents: {},
    },
  };
  const series = {
    room_code: "ABCD2345",
    round_number: 1,
    status: "active",
    current_game_number: 1,
    host_game_wins: 1,
    guest_game_wins: 0,
    host_start_ready_at: 150,
    guest_start_ready_at: 151,
  };
  const baseGame = {
    room_code: "ABCD2345",
    round_number: 1,
    game_number: 1,
    status: "settled_result_ready",
    winner_role: "host",
    host_score: 104,
    guest_score: 99,
    result_json: JSON.stringify(result),
    host_revealed_at: null,
    guest_revealed_at: null,
    host_next_ready_at: null,
    guest_next_ready_at: null,
  };
  const strategies = [
    { game_number: 1, role: "host", strategy_json: JSON.stringify(storedHost) },
    { game_number: 1, role: "guest", strategy_json: JSON.stringify(storedGuest) },
  ];
  const hidden = buildStrategyRoomViewerSnapshot({
    room: roomRow(),
    role: "host",
    series,
    games: [baseGame],
    strategies,
  });
  assert.equal(hidden.phase, "result_ready");
  assert.equal(hidden.lineups.opponentCode, null);
  assert.equal(hidden.currentGame.strategy.opponent, null);
  assert.equal(hidden.currentGame.result, null);
  assert.equal(hidden.history.length, 0);
  assert.deepEqual(hidden.series.wins, { own: 0, opponent: 0, host: 0, guest: 0 });

  const revealed = buildStrategyRoomViewerSnapshot({
    room: roomRow(),
    role: "host",
    series,
    games: [{ ...baseGame, host_revealed_at: 170 }],
    strategies,
  });
  assert.equal(revealed.phase, "result_revealed");
  assert.equal(revealed.lineups.opponentCode, lineupCode());
  assert.deepEqual(revealed.currentGame.strategy.opponent, storedGuest);
  assert.deepEqual(revealed.currentGame.result, projectStrategyRoomPublicResult(result));
  assert.equal(revealed.history.length, 1);
  assert.deepEqual(revealed.series.wins, { own: 1, opponent: 0, host: 1, guest: 0 });

  const guestStillHidden = buildStrategyRoomViewerSnapshot({
    room: roomRow(),
    role: "guest",
    series,
    games: [{ ...baseGame, host_revealed_at: 170 }],
    strategies,
  });
  assert.equal(guestStillHidden.lineups.opponentCode, null);
  assert.equal(guestStillHidden.currentGame.result, null);
  assert.deepEqual(guestStillHidden.series.wins, { own: 0, opponent: 0, host: 0, guest: 0 });
});

test("manual wire fields reach both frozen runtime plans and executions", () => {
  const hostWire = {
    offense: {
      primaryPlan: "perimeterEngine",
      secondaryPlan: "midPostAttack",
      primaryAttackerId: LINEUP[1],
      secondaryAttackerId: LINEUP[3],
    },
    defense: {
      primaryPlan: "selectiveSwitch",
      secondaryPlan: "deepDrop",
      focusTargetId: null,
      leadDefenderId: LINEUP[0],
      rimProtectorId: LINEUP[4],
    },
  };
  const guestWire = {
    offense: {
      primaryPlan: "midPostAttack",
      secondaryPlan: "transitionPressure",
      primaryAttackerId: LINEUP[3],
      secondaryAttackerId: LINEUP[1],
    },
    defense: {
      primaryPlan: "deepDrop",
      secondaryPlan: "ice",
      focusTargetId: null,
      leadDefenderId: LINEUP[1],
      rimProtectorId: LINEUP[4],
    },
  };
  const result = settleStrategyRoomGame({
    hostLineupCode: lineupCode(),
    guestLineupCode: lineupCode(),
    seriesSeed: "server-wire-adapter-contract",
    gameNumber: 1,
    hostWins: 0,
    guestWins: 0,
    hostStrategy: strategyRoomWireToSettlerStrategy(hostWire),
    guestStrategy: strategyRoomWireToSettlerStrategy(guestWire),
  });
  const plans = result.game.matchupModel.plans;
  assert.deepEqual(plans.teamA.offense, {
    mode: "manual",
    manualSelection: true,
    primaryPlan: "perimeterEngine",
    secondaryPlan: "midPostAttack",
    primaryAttackerId: LINEUP[1],
    secondaryAttackerId: LINEUP[3],
  });
  assert.equal(plans.teamA.defense.mode, "manual");
  assert.equal(plans.teamA.defense.primaryCoverage, "selectiveSwitch");
  assert.equal(plans.teamA.defense.leadDefenderId, LINEUP[0]);
  assert.equal(plans.teamB.offense.mode, "manual");
  assert.equal(plans.teamB.offense.primaryPlan, "midPostAttack");
  assert.equal(plans.teamB.offense.primaryAttackerId, LINEUP[3]);
  assert.equal(plans.teamB.defense.primaryCoverage, "deepDrop");
  assert.equal(result.game.matchupModel.executions.teamA.defense.mode, "manual");
  assert.equal(result.game.matchupModel.executions.teamB.defense.mode, "manual");
  assert.ok(result.game.matchupModel.executions.teamA.offense.shares.perimeterEngine > 0.5);
  assert.ok(result.game.matchupModel.executions.teamB.offense.shares.midPostAttack > 0.5);
});

test("public result is a strict whitelist while preserving score, ten-player box and event id", () => {
  const raw = settleStrategyRoomGame({
    hostLineupCode: lineupCode(),
    guestLineupCode: lineupCode(),
    seriesSeed: "server-public-result-contract",
    gameNumber: 1,
    hostWins: 0,
    guestWins: 0,
  });
  raw.game.specialEvent = {
    schemaVersion: "battle-special-event-1.0.0",
    id: "public-event-id-1",
    gameNumber: 1,
    type: "nightlife_sighting",
    teamId: "host",
    probabilityModifierTeamA: 0.5,
    diagnostics: { draw: 0.1 },
  };
  const publicResult = projectStrategyRoomPublicResult(raw);
  const forbidden = /probability|expected|realized|matchupModel|diagnostic|trigger|draw|threshold|seed|settlementDelta/i;
  const keys = [];
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      visit(child);
    }
  };
  visit(publicResult);
  assert.deepEqual(keys.filter(key => forbidden.test(key)), []);
  assert.deepEqual(publicResult.score, raw.score);
  assert.equal(publicResult.game.teamABox.players.length, 5);
  assert.equal(publicResult.game.teamBBox.players.length, 5);
  assert.equal(publicResult.game.teamABox.players.length + publicResult.game.teamBBox.players.length, 10);
  assert.equal(publicResult.game.specialEvent.id, "public-event-id-1");
  assert.equal("matchupModel" in publicResult.game, false);
});

test("terminal winner and complete status remain viewer-specific until reveal", () => {
  const hostStrategy = normalizeStrategyRoomSubmission(emptyStrategy());
  const guestStrategy = normalizeStrategyRoomSubmission(emptyStrategy({ requestId: "strategy-terminal-guest" }));
  const stored = strategy => ({
    schemaVersion: strategy.schemaVersion,
    submissionSource: strategy.submissionSource,
    lineupSnapshot: strategy.lineupSnapshot,
    offense: strategy.offense,
    defense: strategy.defense,
  });
  const result = {
    schemaVersion: BATTLE_ROOM_GAME_RESULT_SCHEMA,
    settlementVersion: BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION,
    winnerRole: "host",
    score: { host: 101, guest: 98 },
    game: { number: 7, winnerId: "host", teamAScore: 101, teamBScore: 98 },
  };
  const series = {
    status: "complete",
    current_game_number: 7,
    host_game_wins: 4,
    guest_game_wins: 3,
  };
  const game = {
    game_number: 7,
    status: "settled_result_ready",
    winner_role: "host",
    result_json: JSON.stringify(result),
    host_revealed_at: null,
    guest_revealed_at: null,
  };
  const strategies = [
    { game_number: 7, role: "host", strategy_json: JSON.stringify(stored(hostStrategy)) },
    { game_number: 7, role: "guest", strategy_json: JSON.stringify(stored(guestStrategy)) },
  ];
  const hiddenHost = buildStrategyRoomViewerSnapshot({ room: roomRow(), role: "host", series, games: [game], strategies });
  const hiddenGuest = buildStrategyRoomViewerSnapshot({ room: roomRow(), role: "guest", series, games: [game], strategies });
  assert.equal(hiddenHost.series.status, "active");
  assert.equal(hiddenGuest.series.status, "active");
  assert.deepEqual(hiddenHost.series.wins, { own: 3, opponent: 3, host: 3, guest: 3 });
  assert.deepEqual(hiddenGuest.series.wins, { own: 3, opponent: 3, host: 3, guest: 3 });
  const revealedHost = buildStrategyRoomViewerSnapshot({
    room: roomRow(), role: "host", series,
    games: [{ ...game, host_revealed_at: 500 }], strategies,
  });
  assert.equal(revealedHost.series.status, "complete");
  assert.deepEqual(revealedHost.series.wins, { own: 4, opponent: 3, host: 4, guest: 3 });
});

test("authorization uses a bearer room token and canonical JSON is order-stable", () => {
  const request = new Request("https://example.test/api/battle/rooms/ABCD2345/series", {
    headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
  });
  assert.equal(normalizeStrategyRoomAuthorization(request), SESSION_TOKEN);
  assert.throws(() => normalizeStrategyRoomAuthorization(new Request(request.url)), error => (
    error instanceof ApiError && error.code === "invalid_room_session"
  ));
  assert.equal(
    canonicalStrategyRoomJson({ z: 1, a: { y: 2, x: 3 } }),
    canonicalStrategyRoomJson({ a: { x: 3, y: 2 }, z: 1 }),
  );
});
