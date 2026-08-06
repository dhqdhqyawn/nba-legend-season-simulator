import { requireDatabase } from "../../_lib/database.mjs";
import { ApiError } from "../../_lib/errors.mjs";
import { getAnalyticsSummary } from "../../_lib/product-analytics.mjs";
import {
  apiErrorResponse,
  jsonResponse,
  methodNotAllowed,
  optionsResponse,
} from "../../_lib/http.mjs";
import { assertSameOrigin, requireAdmin } from "../../_lib/security.mjs";

const WINDOWS = Object.freeze({
  "12h": 12,
  "24h": 24,
  "3d": 72,
  "7d": 168,
  "14d": 336,
  "30d": 720,
  "90d": 2160,
});
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1_000;
const DAY_SECONDS = 86_400;

function parseWindow(value, legacyDays) {
  if (value && WINDOWS[value]) return { windowKey: value, windowHours: WINDOWS[value] };
  if (value) throw new ApiError(400, "invalid_window", "window 无效。");
  if (legacyDays !== null) {
    if (!/^\d+$/.test(legacyDays)) throw new ApiError(400, "invalid_days", "days 必须是正整数。");
    const days = Number(legacyDays);
    if (days < 1 || days > 90) throw new ApiError(400, "invalid_days", "days 应为 1–90。");
    return { windowKey: `${days}d`, windowHours: days * 24 };
  }
  return { windowKey: "30d", windowHours: WINDOWS["30d"] };
}

function parseBeijingDateStart(value) {
  if (!DATE_PATTERN.test(String(value || ""))) return null;
  const [year, month, day] = value.split("-").map(Number);
  const utcMs = Date.UTC(year, month - 1, day) - BEIJING_OFFSET_MS;
  const check = new Date(utcMs + BEIJING_OFFSET_MS);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) return null;
  return Math.floor(utcMs / 1_000);
}

export function parseAnalyticsRange(searchParams) {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const hasCustomRange = from !== null || to !== null;
  if (!hasCustomRange) {
    return parseWindow(searchParams.get("window"), searchParams.get("days"));
  }
  if (!from || !to) {
    throw new ApiError(400, "invalid_date_range", "开始日期和结束日期必须同时填写。");
  }
  if (searchParams.has("window") || searchParams.has("days")) {
    throw new ApiError(400, "ambiguous_date_range", "自定义日期不能与预设窗口同时使用。");
  }
  const rangeStart = parseBeijingDateStart(from);
  const toStart = parseBeijingDateStart(to);
  if (rangeStart === null || toStart === null) {
    throw new ApiError(400, "invalid_date_range", "日期格式无效，请使用 YYYY-MM-DD。");
  }
  if (toStart < rangeStart) {
    throw new ApiError(400, "invalid_date_range", "结束日期不能早于开始日期。");
  }
  const rangeEnd = toStart + DAY_SECONDS;
  const rangeDays = (rangeEnd - rangeStart) / DAY_SECONDS;
  if (rangeDays > 90) {
    throw new ApiError(400, "date_range_too_large", "自定义日期范围最多为 90 天。");
  }
  return {
    windowKey: "custom",
    windowHours: rangeDays * 24,
    rangeStart,
    rangeEnd,
    rangeFrom: from,
    rangeTo: to,
  };
}

function parseEnvironment(value) {
  const environment = value || "production";
  if (!["production", "candidate", "local"].includes(environment)) {
    throw new ApiError(400, "invalid_environment", "environment 无效。");
  }
  return environment;
}

export function requireAnalyticsAdmin(request, env) {
  requireAdmin(request, {
    FEEDBACK_ADMIN_KEY: env?.ANALYTICS_ADMIN_KEY || env?.FEEDBACK_ADMIN_KEY,
  });
}

async function handleGet(context) {
  const { request, env } = context;
  assertSameOrigin(request);
  requireAnalyticsAdmin(request, env);
  const database = requireDatabase(env);
  const url = new URL(request.url);
  const window = parseAnalyticsRange(url.searchParams);
  const environment = parseEnvironment(url.searchParams.get("environment"));
  const summary = await getAnalyticsSummary(database, {
    ...window,
    environment,
    nowSeconds: Math.floor(Date.now() / 1_000),
  });
  return jsonResponse(request, { ok: true, summary });
}

export async function onRequest(context) {
  try {
    if (context.request.method === "GET") return await handleGet(context);
    if (context.request.method === "OPTIONS") {
      return optionsResponse(context.request, ["GET", "OPTIONS"]);
    }
    return methodNotAllowed(context.request, ["GET", "OPTIONS"]);
  } catch (error) {
    return apiErrorResponse(context.request, error);
  }
}
