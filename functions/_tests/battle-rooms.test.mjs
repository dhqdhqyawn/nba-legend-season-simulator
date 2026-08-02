import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../_lib/errors.mjs";
import { joinBattleRoom, publicRoom } from "../_lib/battle-rooms.mjs";
import {
  BATTLE_ROOM_PROTOCOL,
  normalizeRoomCode,
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
    lineupCode: code,
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  }, "host"), {
    name: "小丁",
    lineupCode: code,
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  });
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
    lineupCode: lineupCode(),
    protocolVersion: "old-room-version",
  }, "guest"), error => error instanceof ApiError && error.code === "protocol_mismatch");
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
    status: "ready",
    host_name: "房主",
    host_lineup_code: lineupCode([1, 2, 3, 4, 5]),
    guest_name: "挑战者",
    guest_lineup_code: lineupCode([6, 7, 8, 9, 10]),
    protocol_version: BATTLE_ROOM_PROTOCOL,
    match_seed: "locked-seed",
    created_at: 100,
    joined_at: 120,
    expires_at: 200,
    ...overrides,
  };
}

function databaseReturning(existing) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              return sql.startsWith("UPDATE") ? null : existing;
            },
          };
        },
      };
    },
  };
}

test("expired public rooms hide the locked guest and seed", () => {
  const room = publicRoom(roomRow(), 200);
  assert.equal(room.status, "expired");
  assert.equal(room.guest, null);
  assert.equal(room.seed, null);
});

test("joining an expired room returns the explicit expiry error", async () => {
  await assert.rejects(
    joinBattleRoom(databaseReturning(roomRow()), "ABCD2345", {
      name: "迟到者",
      lineupCode: lineupCode([11, 12, 13, 14, 15]),
      protocolVersion: BATTLE_ROOM_PROTOCOL,
    }, 200),
    error => error instanceof ApiError && error.status === 410 && error.code === "room_expired",
  );
});

test("joining a room locked to another protocol returns a mismatch", async () => {
  await assert.rejects(
    joinBattleRoom(databaseReturning(roomRow({ protocol_version: "older-room-protocol" })), "ABCD2345", {
      name: "挑战者",
      lineupCode: lineupCode([11, 12, 13, 14, 15]),
      protocolVersion: BATTLE_ROOM_PROTOCOL,
    }, 150),
    error => error instanceof ApiError && error.status === 409 && error.code === "protocol_mismatch",
  );
});
