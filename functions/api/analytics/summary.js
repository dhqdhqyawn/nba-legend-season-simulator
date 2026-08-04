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

function parseEnvironment(value) {
  const environment = value || "production";
  if (!["production", "candidate", "local"].includes(environment)) {
    throw new ApiError(400, "invalid_environment", "environment 无效。");
  }
  return environment;
}

async function handleGet(context) {
  const { request, env } = context;
  assertSameOrigin(request);
  requireAdmin(request, env);
  const database = requireDatabase(env);
  const url = new URL(request.url);
  const window = parseWindow(url.searchParams.get("window"), url.searchParams.get("days"));
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
