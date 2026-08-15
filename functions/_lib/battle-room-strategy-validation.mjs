import { ApiError } from "./errors.mjs";
import {
  BATTLE_ROOM_STRATEGY_PROTOCOL,
  validateBattleLineupCode,
} from "./battle-rooms-validation.mjs";

export const BATTLE_ROOM_STRATEGY_SCHEMA = "nba5-room-game-strategy-1.0.0";
export const BATTLE_ROOM_GAME_RESULT_SCHEMA = "nba5-room-game-result-1.0.0";
export const BATTLE_ROOM_STRATEGY_SETTLEMENT_VERSION =
  "nba5-room-strategy-settlement-4d5d02-event2.2-browser1.8-loop0.6.8";

export const BATTLE_ROOM_OFFENSE_PLANS = Object.freeze([
  "perimeterEngine",
  "dualCreator",
  "dynamicMotion",
  "movementShooting",
  "midPostAttack",
  "interiorHub",
  "twinTower",
  "transitionPressure",
]);

export const BATTLE_ROOM_DEFENSE_PLANS = Object.freeze([
  "deepDrop",
  "highDrop",
  "hedgeRecover",
  "selectiveSwitch",
  "allSwitch",
  "blitz",
  "ice",
]);

const SESSION_TOKEN_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{32}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{12,80}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function requireObject(value, code = "invalid_input") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, code, "请求内容必须是对象。");
  }
  return value;
}

function normalizeSessionToken(value) {
  const sessionToken = String(value ?? "").trim();
  if (!SESSION_TOKEN_PATTERN.test(sessionToken)) {
    throw new ApiError(401, "invalid_room_session", "房间身份已经失效，请重新进入房间。");
  }
  return sessionToken;
}

function normalizePositiveInteger(value, code, message, maximum = Number.MAX_SAFE_INTEGER) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
    throw new ApiError(400, code, message);
  }
  return normalized;
}

function normalizeVersionKey(value, field, { nullable = true } = {}) {
  if (value == null || value === "") {
    if (nullable) return null;
    throw new ApiError(400, "invalid_strategy_player", field + "必须使用稳定球员版本键。");
  }
  const key = String(value).trim();
  const length = Array.from(key).length;
  if (length < 1 || length > 160 || CONTROL_CHARACTER_PATTERN.test(key)) {
    throw new ApiError(400, "invalid_strategy_player", field + "必须使用稳定球员版本键。");
  }
  return key;
}

function normalizePlan(value, allowed, field) {
  if (value == null || value === "") return null;
  const plan = String(value);
  if (!allowed.includes(plan)) {
    throw new ApiError(400, "invalid_strategy_plan", field + "不是可用方案。");
  }
  return plan;
}

function normalizeProtocol(input) {
  if (input.protocolVersion !== BATTLE_ROOM_STRATEGY_PROTOCOL) {
    throw new ApiError(409, "protocol_mismatch", "房间不是当前逐场策略协议，请刷新后重试。");
  }
  return BATTLE_ROOM_STRATEGY_PROTOCOL;
}

export function normalizeStrategyRoomAction(input) {
  const object = requireObject(input);
  return {
    sessionToken: normalizeSessionToken(object.sessionToken),
    round: normalizePositiveInteger(object.round, "invalid_series_round", "系列赛轮次无效。"),
    protocolVersion: normalizeProtocol(object),
  };
}

export function normalizeStrategyRoomAuthorization(request) {
  const authorization = String(request?.headers?.get("Authorization") || "");
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    throw new ApiError(401, "invalid_room_session", "请使用房间身份读取逐场状态。", {
      "WWW-Authenticate": 'Bearer realm="nba5-strategy-room"',
    });
  }
  return normalizeSessionToken(match[1]);
}

export function normalizeStrategyRoomSubmission(input) {
  const object = requireObject(input);
  if (object.schemaVersion !== BATTLE_ROOM_STRATEGY_SCHEMA) {
    throw new ApiError(409, "strategy_schema_mismatch", "策略表单版本不一致，请刷新后重试。");
  }
  const base = normalizeStrategyRoomAction(object);
  const requestId = String(object.requestId ?? "").trim();
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new ApiError(400, "invalid_request_id", "策略请求标识无效。");
  }
  const submissionSource = String(object.submissionSource || "");
  if (!/^(manual|automatic)$/.test(submissionSource)) {
    throw new ApiError(400, "invalid_submission_source", "请选择手动策略或均衡自动。");
  }
  if (!Array.isArray(object.lineupSnapshot) || object.lineupSnapshot.length !== 5) {
    throw new ApiError(400, "invalid_lineup_snapshot", "本场阵容快照必须正好包含五个稳定版本键。");
  }
  const lineupSnapshot = object.lineupSnapshot.map((value, index) => (
    normalizeVersionKey(value, "lineupSnapshot[" + index + "]", { nullable: false })
  ));
  if (new Set(lineupSnapshot).size !== 5) {
    throw new ApiError(400, "invalid_lineup_snapshot", "本场阵容快照不能包含重复球员版本。");
  }

  const offenseInput = requireObject(object.offense, "invalid_strategy_offense");
  const defenseInput = requireObject(object.defense, "invalid_strategy_defense");
  const offense = {
    primaryPlan: normalizePlan(offenseInput.primaryPlan, BATTLE_ROOM_OFFENSE_PLANS, "主要进攻方案"),
    secondaryPlan: normalizePlan(offenseInput.secondaryPlan, BATTLE_ROOM_OFFENSE_PLANS, "辅助进攻方案"),
    primaryAttackerId: normalizeVersionKey(offenseInput.primaryAttackerId, "第一主攻"),
    secondaryAttackerId: normalizeVersionKey(offenseInput.secondaryAttackerId, "第二主攻"),
  };
  const defense = {
    primaryPlan: normalizePlan(defenseInput.primaryPlan, BATTLE_ROOM_DEFENSE_PLANS, "主要防守方案"),
    secondaryPlan: normalizePlan(defenseInput.secondaryPlan, BATTLE_ROOM_DEFENSE_PLANS, "辅助防守方案"),
    focusTargetId: normalizeVersionKey(defenseInput.focusTargetId, "重点限制对象"),
    leadDefenderId: normalizeVersionKey(defenseInput.leadDefenderId, "领防人"),
    rimProtectorId: normalizeVersionKey(defenseInput.rimProtectorId, "护框手"),
  };
  if (offense.secondaryPlan === offense.primaryPlan) offense.secondaryPlan = null;
  if (defense.secondaryPlan === defense.primaryPlan) defense.secondaryPlan = null;
  if (offense.primaryAttackerId && offense.primaryAttackerId === offense.secondaryAttackerId) {
    throw new ApiError(400, "duplicate_strategy_role", "第一主攻与第二主攻不能是同一人。");
  }
  if (submissionSource === "automatic") {
    const selected = [
      ...Object.values(offense),
      ...Object.values(defense),
    ].some(value => value != null);
    if (selected) {
      throw new ApiError(400, "automatic_strategy_not_empty", "均衡自动不能夹带人工方案或人员指定。");
    }
  }
  return {
    ...base,
    schemaVersion: BATTLE_ROOM_STRATEGY_SCHEMA,
    requestId,
    submissionSource,
    lineupSnapshot,
    offense,
    defense,
  };
}

export function stableBattleVersionToken(versionKey) {
  let hash = 2166136261;
  for (const character of String(versionKey)) {
    let codePoint = character.codePointAt(0);
    do {
      hash ^= codePoint & 0xff;
      hash = Math.imul(hash, 16777619);
      codePoint >>>= 8;
    } while (codePoint > 0);
  }
  return hash >>> 0;
}

export function decodeBattleLineupTokens(lineupCode) {
  validateBattleLineupCode(lineupCode);
  const body = lineupCode.slice("NBA5-S1-".length);
  const base64 = body.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const readUint32 = offset => (
    bytes[offset] * 0x1000000
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  ) >>> 0;
  return Array.from({ length: 5 }, (_, index) => readUint32(1 + index * 4));
}

export function assertStrategyLineupContract(submission, {
  ownLineupCode,
  opponentLineupCode,
  gameNumber,
}) {
  const ownTokens = decodeBattleLineupTokens(ownLineupCode);
  const snapshotTokens = submission.lineupSnapshot.map(stableBattleVersionToken);
  assertTokenArraysEqual(snapshotTokens, ownTokens, "本场阵容快照与已经锁定的五人不一致。");
  const ownKeys = new Set(submission.lineupSnapshot);
  for (const [field, value] of Object.entries({
    primaryAttackerId: submission.offense.primaryAttackerId,
    secondaryAttackerId: submission.offense.secondaryAttackerId,
    leadDefenderId: submission.defense.leadDefenderId,
    rimProtectorId: submission.defense.rimProtectorId,
  })) {
    if (value && !ownKeys.has(value)) {
      throw new ApiError(400, "strategy_player_not_in_lineup", field + "不属于本方锁定阵容。");
    }
  }
  if (gameNumber === 1 && submission.defense.focusTargetId) {
    throw new ApiError(400, "g1_focus_forbidden", "第一场结算前不能指定重点限制对象。");
  }
  if (gameNumber > 1 && submission.defense.focusTargetId) {
    const opponentTokens = new Set(decodeBattleLineupTokens(opponentLineupCode));
    if (!opponentTokens.has(stableBattleVersionToken(submission.defense.focusTargetId))) {
      throw new ApiError(400, "focus_target_not_in_opponent_lineup", "重点限制对象不属于对方锁定阵容。");
    }
  }
  return submission;
}

function assertTokenArraysEqual(actual, expected, message) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new ApiError(409, "lineup_snapshot_mismatch", message);
  }
}
