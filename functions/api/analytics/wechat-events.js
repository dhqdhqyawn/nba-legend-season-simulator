import { requireDatabase } from "../../_lib/database.mjs";
import { ApiError } from "../../_lib/errors.mjs";
import { apiErrorResponse, jsonResponse, methodNotAllowed } from "../../_lib/http.mjs";
import { constantTimeEqual, extractAdminKey } from "../../_lib/security.mjs";
import { normalizeWechatMirror, persistWechatMirror, normalizeWechatOfficial, persistWechatOfficial } from "../../_lib/wechat-analytics.mjs";

async function handlePost({ request, env }) {
  const configured = String(env?.WECHAT_ANALYTICS_SYNC_KEY || "");
  if (!configured) throw new ApiError(503, "wechat_sync_not_configured", "小程序统计同步尚未配置。");
  if (!constantTimeEqual(extractAdminKey(request), configured)) throw new ApiError(401, "unauthorized", "同步密钥无效。");
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "同步接口只接受 JSON。");
  }
  const payload = await request.json();
  const database = requireDatabase(env);
  const official = payload?.type === "official_daily";
  const rows = official ? normalizeWechatOfficial(payload) : normalizeWechatMirror(payload);
  const inserted = official ? await persistWechatOfficial(database, rows) : await persistWechatMirror(database, rows);
  return jsonResponse(request, { ok: true, accepted: rows.length, inserted }, 202);
}

export async function onRequest(context) {
  try {
    if (context.request.method === "POST") return await handlePost(context);
    return methodNotAllowed(context.request, ["POST"]);
  } catch (error) { return apiErrorResponse(context.request, error); }
}
