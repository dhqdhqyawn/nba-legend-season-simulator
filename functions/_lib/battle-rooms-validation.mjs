import { ApiError } from "./errors.mjs";

export const BATTLE_ROOM_PROTOCOL = "nba5-room-v3.v35.6.battle-1.8";
export const BATTLE_ROOM_STRATEGY_PROTOCOL = "nba5-room-v4.strategy-series-0.1";
export const BATTLE_ROOM_PROTOCOLS = Object.freeze([
  BATTLE_ROOM_PROTOCOL,
  BATTLE_ROOM_STRATEGY_PROTOCOL,
]);
export const BATTLE_ROOM_TTL_SECONDS = 30 * 60;
export const BATTLE_ROOM_STRATEGY_TTL_SECONDS = 6 * 60 * 60;
export function battleRoomTtlSeconds(protocolVersion) {
  return protocolVersion === BATTLE_ROOM_STRATEGY_PROTOCOL
    ? BATTLE_ROOM_STRATEGY_TTL_SECONDS
    : BATTLE_ROOM_TTL_SECONDS;
}
export const BATTLE_ROOM_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
export const BATTLE_ROOM_TYPES = Object.freeze(["fair_pack", "open_lineup"]);
export const BATTLE_ROOM_CARD_POOLS = Object.freeze([
  "all",
  "modern_2015_2026",
  "historic_pre_2015",
]);
const ROOM_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{12,80}$/;

const LINEUP_PREFIX = "NBA5-S1-";
const LINEUP_BODY_PATTERN = /^[A-Za-z0-9_-]{34}$/;
const LINEUP_BYTES = 25;
const textLength = value => Array.from(String(value)).length;

function normalizeRoomProtocol(value, { allowStrategy = false } = {}) {
  const protocolVersion = String(value || "");
  const allowed = allowStrategy ? BATTLE_ROOM_PROTOCOLS : [BATTLE_ROOM_PROTOCOL];
  if (!allowed.includes(protocolVersion)) {
    throw new ApiError(409, "protocol_mismatch", "游戏版本不一致，请刷新后重新创建房间。");
  }
  return protocolVersion;
}

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
  const protocolVersion = normalizeRoomProtocol(input.protocolVersion, { allowStrategy: true });
  const normalized = {
    name: normalizeRoomName(input.name, role === "host" ? "房主" : "挑战者"),
    protocolVersion,
  };
  if (role === "host") {
    normalized.roomType = BATTLE_ROOM_TYPES.includes(input.roomType)
      ? input.roomType
      : "fair_pack";
    const requestedPool = input.cardPoolKey == null ? "all" : String(input.cardPoolKey);
    if (!BATTLE_ROOM_CARD_POOLS.includes(requestedPool)) {
      throw new ApiError(400, "invalid_card_pool", "请选择有效的房间卡池。");
    }
    normalized.cardPoolKey = requestedPool;
  }
  return normalized;
}

function normalizeSessionToken(input) {
  const sessionToken = String(input.sessionToken ?? "").trim();
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{32}$/.test(sessionToken)) {
    throw new ApiError(401, "invalid_room_session", "房间身份已经失效，请重新进入房间。");
  }
  return sessionToken;
}

export function normalizeRoomLineupSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "invalid_input", "请求内容必须是对象。");
  }
  const protocolVersion = normalizeRoomProtocol(input.protocolVersion, { allowStrategy: true });
  const sessionToken = normalizeSessionToken(input);
  return {
    sessionToken,
    lineupCode: validateBattleLineupCode(input.lineupCode),
    protocolVersion,
  };
}

export function normalizeRoomStartSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "invalid_input", "请求内容必须是对象。");
  }
  const protocolVersion = normalizeRoomProtocol(input.protocolVersion);
  const sessionToken = normalizeSessionToken(input);
  return { sessionToken, protocolVersion };
}

export function normalizeRoomKickSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "invalid_input", "请求内容必须是对象。");
  }
  const protocolVersion = normalizeRoomProtocol(input.protocolVersion, { allowStrategy: true });
  return {
    sessionToken: normalizeSessionToken(input),
    protocolVersion,
  };
}

export function normalizeRoomPackSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "invalid_input", "请求内容必须是对象。");
  }
  const protocolVersion = normalizeRoomProtocol(input.protocolVersion, { allowStrategy: true });
  const strategyRoom = protocolVersion === BATTLE_ROOM_STRATEGY_PROTOCOL;
  const expectedPackCount = Number(input.expectedPackCount);
  if (strategyRoom && (input.expectedPackCount == null
    || !Number.isSafeInteger(expectedPackCount) || expectedPackCount < 0)) {
    throw new ApiError(
      400,
      "invalid_expected_pack_count",
      "逐场房开包请求必须携带当前已开包数。",
    );
  }
  const requestId = String(input.requestId ?? "").trim();
  if (strategyRoom && !ROOM_REQUEST_ID_PATTERN.test(requestId)) {
    throw new ApiError(400, "invalid_request_id", "开包请求标识无效。");
  }
  return {
    sessionToken: normalizeSessionToken(input),
    protocolVersion,
    ...(strategyRoom ? { expectedPackCount, requestId } : {}),
  };
}

export function normalizeRoomRematchSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "invalid_input", "请求内容必须是对象。");
  }
  const protocolVersion = normalizeRoomProtocol(input.protocolVersion, { allowStrategy: true });
  if (!/^(same|redraft)$/.test(String(input.mode || ""))) {
    throw new ApiError(400, "invalid_rematch_mode", "请选择原阵容再战或重新组队。");
  }
  const strategyRoom = protocolVersion === BATTLE_ROOM_STRATEGY_PROTOCOL;
  const round = Number(input.round);
  if (strategyRoom && (!Number.isSafeInteger(round) || round < 1)) {
    throw new ApiError(400, "invalid_series_round", "逐场策略再战必须携带当前轮次。");
  }
  let cardPoolKey;
  if (strategyRoom && input.cardPoolKey != null) {
    cardPoolKey = String(input.cardPoolKey);
    if (!BATTLE_ROOM_CARD_POOLS.includes(cardPoolKey)) {
      throw new ApiError(400, "invalid_card_pool", "请选择有效的下一轮卡池。");
    }
  }
  return {
    sessionToken: normalizeSessionToken(input),
    mode: String(input.mode),
    protocolVersion,
    ...(strategyRoom ? { round } : {}),
    ...(cardPoolKey == null ? {} : { cardPoolKey }),
  };
}

export function normalizeRoomScoreSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "invalid_input", "请求内容必须是对象。");
  }
  const protocolVersion = normalizeRoomProtocol(input.protocolVersion);
  const round = Number(input.round);
  if (!Number.isSafeInteger(round) || round < 1) {
    throw new ApiError(400, "invalid_score_round", "记分轮次无效。");
  }
  const winner = String(input.winner || "");
  if (!/^(host|guest)$/.test(winner)) {
    throw new ApiError(400, "invalid_score_winner", "系列赛胜方无效。");
  }
  return {
    sessionToken: normalizeSessionToken(input),
    round,
    winner,
    protocolVersion,
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
