import { ApiError } from "./errors.mjs";

export const BATTLE_ROOM_PROTOCOL = "nba5-room-v1.v35.6.battle-1.5";
export const BATTLE_ROOM_TTL_SECONDS = 72 * 60 * 60;
export const BATTLE_ROOM_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

const LINEUP_PREFIX = "NBA5-S1-";
const LINEUP_BODY_PATTERN = /^[A-Za-z0-9_-]{34}$/;
const LINEUP_BYTES = 25;
const textLength = value => Array.from(String(value)).length;

function decodeBase64Url(value) {
  if (!LINEUP_BODY_PATTERN.test(value)) {
    throw new ApiError(400, "invalid_nba5", "请使用当前版本生成的 NBA5 阵容码。");
  }
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  let binary;
  try {
    binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  } catch {
    throw new ApiError(400, "invalid_nba5", "NBA5 阵容码无法解析。");
  }
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function checksum32(bytes, length) {
  let hash = 2166136261;
  for (let index = 0; index < length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readUint32(bytes, offset) {
  return (
    bytes[offset] * 0x1000000
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  ) >>> 0;
}

export function normalizeRoomCode(value) {
  const roomCode = String(value ?? "").trim().toUpperCase();
  if (!BATTLE_ROOM_CODE_PATTERN.test(roomCode)) {
    throw new ApiError(400, "invalid_room_code", "房间码应为 8 位字母或数字。");
  }
  return roomCode;
}

export function normalizeRoomName(value, fallback) {
  const name = String(value ?? "").trim() || fallback;
  if (textLength(name) < 1 || textLength(name) > 12 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new ApiError(400, "invalid_room_name", "房间昵称应为 1–12 个字符。");
  }
  return name;
}

export function validateBattleLineupCode(value) {
  const lineupCode = String(value ?? "").trim();
  if (!lineupCode.startsWith(LINEUP_PREFIX) || lineupCode.length !== 42) {
    throw new ApiError(400, "invalid_nba5", "请使用当前版本生成的短 NBA5 阵容码。");
  }
  const bytes = decodeBase64Url(lineupCode.slice(LINEUP_PREFIX.length));
  if (bytes.length !== LINEUP_BYTES || bytes[0] !== 1) {
    throw new ApiError(400, "invalid_nba5", "NBA5 阵容码版本或长度无效。");
  }
  const expected = readUint32(bytes, 21);
  if (checksum32(bytes, 21) !== expected) {
    throw new ApiError(400, "invalid_nba5", "NBA5 阵容码校验失败。");
  }
  const tokens = Array.from({ length: 5 }, (_, index) => readUint32(bytes, 1 + index * 4));
  if (new Set(tokens).size !== 5) {
    throw new ApiError(400, "invalid_nba5", "NBA5 阵容中存在重复球员版本。");
  }
  return lineupCode;
}

export function normalizeRoomSubmission(input, role) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "invalid_input", "请求内容必须是对象。");
  }
  if (input.protocolVersion !== BATTLE_ROOM_PROTOCOL) {
    throw new ApiError(409, "protocol_mismatch", "游戏版本不一致，请刷新后重新创建房间。");
  }
  return {
    name: normalizeRoomName(input.name, role === "host" ? "房主" : "挑战者"),
    lineupCode: validateBattleLineupCode(input.lineupCode),
    protocolVersion: BATTLE_ROOM_PROTOCOL,
  };
}

export async function parseRoomJson(request) {
  const contentType = String(request.headers.get("Content-Type") || "").split(";", 1)[0].trim();
  if (contentType !== "application/json") {
    throw new ApiError(415, "unsupported_media_type", "请求必须使用 JSON。");
  }
  const declaredLength = Number.parseInt(request.headers.get("Content-Length") || "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > 10_000) {
    throw new ApiError(413, "request_too_large", "请求内容过大。");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 10_000) {
    throw new ApiError(413, "request_too_large", "请求内容过大。");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "请求不是有效 JSON。");
  }
}
