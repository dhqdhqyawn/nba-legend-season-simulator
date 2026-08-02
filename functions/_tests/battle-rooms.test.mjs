import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../_lib/errors.mjs";
import { publicRoom } from "../_lib/battle-rooms.mjs";
import {
  BATTLE_ROOM_PROTOCOL,
  normalizeRoomCode,
  normalizeRoomLineupSubmission,
  normalizeRoomPackSubmission,
  normalizeRoomRematchSubmission,
  normalizeRoomStartSubmission,
  normalizeRoomSubmission,
  validateBattleLineupCode,
} from "../_lib/battle-rooms-validation.mjs";

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

function lineupCode(tokens = [1, 2, 3, 4, 5]) {
  const bytes = new Uint8Array(25);
  bytes[0] = 1;
  tokens.forEach((token, index) => writeUint32(bytes, 1 + index * 4, token));
  writeUint32(bytes, 21, checksum32(bytes, 21));
  return `NBA5-S1-${Buffer.from(bytes).toString("base64url")}`;
}

test("accepts a current short NBA5 and normalizes room input", () => {
  const code = lineupCode();
  assert.equal(validateBattleLineupCode(code), code);
  assert.deepEqual(normalizeRoomSubmission({
    name: "  小丁  ",
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  }, "host"), {
    name: "小丁",
    roomType: "fair_pack",
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  });
  assert.deepEqual(normalizeRoomLineupSubmission({
    sessionToken: "23456789234567892345678923456789",
    lineupCode: code,
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  }), {
    sessionToken: "23456789234567892345678923456789",
    lineupCode: code,
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  });
});

test("normalizes room rules, pack requests and rematch choices", () => {
  const sessionToken = "23456789234567892345678923456789";
  assert.equal(normalizeRoomSubmission({
    name: "自由房",
    roomType: "open_lineup",
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  }, "host").roomType, "open_lineup");
  assert.deepEqual(normalizeRoomPackSubmission({
    sessionToken,
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  }), { sessionToken, protocolVersion: BATTLE_ROOM_PROTOCOL });
  assert.deepEqual(normalizeRoomRematchSubmission({
    sessionToken,
    mode: "redraft",
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  }), { sessionToken, mode: "redraft", protocolVersion: BATTLE_ROOM_PROTOCOL });
  assert.throws(() => normalizeRoomRematchSubmission({
    sessionToken,
    mode: "anything",
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  }), error => error instanceof ApiError && error.code === "invalid_rematch_mode");
});

test("rejects legacy, damaged and duplicate-token NBA5 codes", () => {
  assert.throws(() => validateBattleLineupCode("NBA5-old"), ApiError);
  const damaged = `${lineupCode().slice(0, -1)}A`;
  assert.throws(() => validateBattleLineupCode(damaged), error => (
    error instanceof ApiError && error.code === "invalid_nba5"
  ));
  assert.throws(() => validateBattleLineupCode(lineupCode([1, 1, 2, 3, 4])), error => (
    error instanceof ApiError && error.code === "invalid_nba5"
  ));
});

test("locks the exact online room protocol", () => {
  assert.throws(() => normalizeRoomSubmission({
    name: "玩家",
    protocolVersion: "old-room-version",
  }, "guest"), error => error instanceof ApiError && error.code === "protocol_mismatch");
});

test("rejects missing or malformed room session tokens", () => {
  assert.throws(() => normalizeRoomLineupSubmission({
    sessionToken: "too-short",
    lineupCode: lineupCode(),
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  }), error => error instanceof ApiError && error.code === "invalid_room_session");
  assert.throws(() => normalizeRoomStartSubmission({
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  }), error => error instanceof ApiError && error.code === "invalid_room_session");
});

test("normalizes only unambiguous eight-character room codes", () => {
  assert.equal(normalizeRoomCode(" abcd2345 "), "ABCD2345");
  assert.throws(() => normalizeRoomCode("ROOM-123"), error => (
    error instanceof ApiError && error.code === "invalid_room_code"
  ));
  assert.throws(() => normalizeRoomCode("ABCDI234"), ApiError);
});

function roomRow(overrides = {}) {
  return {
    room_code: "ABCD2345",
    status: "complete",
    room_type: "fair_pack",
    round_number: 1,
    host_name: "房主",
    host_token_hash: "host-hash",
    host_lineup_code: lineupCode([1, 2, 3, 4, 5]),
    host_ready_at: 130,
    host_pack_count: 2,
    host_rematch_mode: null,
    guest_name: "挑战者",
    guest_token_hash: "guest-hash",
    guest_lineup_code: lineupCode([6, 7, 8, 9, 10]),
    guest_ready_at: 140,
    guest_pack_count: 3,
    guest_rematch_mode: null,
    protocol_version: BATTLE_ROOM_PROTOCOL,
    match_seed: "locked-seed",
    created_at: 100,
    joined_at: 120,
    started_at: 150,
    expires_at: 200,
    ...overrides,
  };
}

test("expired public rooms preserve names but hide lineups and seed", () => {
  const room = publicRoom(roomRow(), 200);
  assert.equal(room.status, "expired");
  assert.equal(room.guest.name, "挑战者");
  assert.equal(room.host.lineupCode, null);
  assert.equal(room.guest.lineupCode, null);
  assert.equal(room.seed, null);
});

test("selecting rooms expose readiness without leaking either lineup", () => {
  const room = publicRoom(roomRow({
    status: "selecting",
    guest_lineup_code: null,
    guest_ready_at: null,
    match_seed: null,
    started_at: null,
  }), 160);
  assert.equal(room.host.ready, true);
  assert.equal(room.guest.ready, false);
  assert.equal(room.host.lineupCode, null);
  assert.equal(room.guest.lineupCode, null);
  assert.equal(room.seed, null);
});

test("complete rooms expose one locked seed and both exact lineups", () => {
  const row = roomRow();
  const room = publicRoom(row, 160);
  assert.equal(room.status, "complete");
  assert.equal(room.roomType, "fair_pack");
  assert.equal(room.round, 1);
  assert.equal(room.host.packsOpened, 2);
  assert.equal(room.guest.packsOpened, 3);
  assert.equal(room.host.lineupCode, row.host_lineup_code);
  assert.equal(room.guest.lineupCode, row.guest_lineup_code);
  assert.equal(room.seed, "locked-seed");
  assert.equal(room.startedAt, new Date(150000).toISOString());
});
