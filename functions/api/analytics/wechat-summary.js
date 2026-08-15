import { requireDatabase } from "../../_lib/database.mjs";
import { apiErrorResponse, jsonResponse, methodNotAllowed, optionsResponse } from "../../_lib/http.mjs";
import { assertSameOrigin } from "../../_lib/security.mjs";
import { parseAnalyticsRange, requireAnalyticsAdmin } from "./summary.js";
import { getWechatSummary } from "../../_lib/wechat-analytics.mjs";

export async function onRequest(context) {
  try {
    if (context.request.method === "OPTIONS") return optionsResponse(context.request, ["GET", "OPTIONS"]);
    if (context.request.method !== "GET") return methodNotAllowed(context.request, ["GET", "OPTIONS"]);
    assertSameOrigin(context.request);
    requireAnalyticsAdmin(context.request, context.env);
    const range = parseAnalyticsRange(new URL(context.request.url).searchParams);
    const summary = await getWechatSummary(requireDatabase(context.env), { ...range, nowSeconds: Math.floor(Date.now() / 1000) });
    return jsonResponse(context.request, { ok: true, summary });
  } catch (error) { return apiErrorResponse(context.request, error); }
}
