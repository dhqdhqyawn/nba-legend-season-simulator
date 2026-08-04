import { requireDatabase } from "../../_lib/database.mjs";
import {
  buildAnalyticsRows,
  enforceAnalyticsRateLimit,
  normalizeAnalyticsPayload,
  persistAnalyticsRows,
  scheduleAnalyticsCleanup,
} from "../../_lib/product-analytics.mjs";
import { ApiError } from "../../_lib/errors.mjs";
import {
  apiErrorResponse,
  jsonResponse,
  methodNotAllowed,
  optionsResponse,
} from "../../_lib/http.mjs";
import { assertSameOrigin } from "../../_lib/security.mjs";

async function parseJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "统计接口只接受 JSON。");
  }
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 32_768) {
    throw new ApiError(413, "analytics_payload_too_large", "统计请求过大。");
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "统计请求 JSON 无效。");
  }
}

async function handlePost(context) {
  const { request, env } = context;
  assertSameOrigin(request);
  const database = requireDatabase(env);
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const payload = normalizeAnalyticsPayload(await parseJson(request), nowSeconds);
  const { clientHash, rows } = await buildAnalyticsRows(request, env, payload, nowSeconds);
  await enforceAnalyticsRateLimit(database, clientHash, rows.length, nowSeconds, env);
  const inserted = await persistAnalyticsRows(database, rows);
  scheduleAnalyticsCleanup(context, database, nowSeconds, env);
  return jsonResponse(request, { ok: true, accepted: rows.length, inserted }, 202);
}

export async function onRequest(context) {
  try {
    if (context.request.method === "POST") return await handlePost(context);
    if (context.request.method === "OPTIONS") {
      return optionsResponse(context.request, ["POST", "OPTIONS"]);
    }
    return methodNotAllowed(context.request, ["POST", "OPTIONS"]);
  } catch (error) {
    return apiErrorResponse(context.request, error);
  }
}

