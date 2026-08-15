import { getBattleRoomStrategySeries } from "../../../../../_lib/battle-room-strategy-series.mjs";
import { normalizeStrategyRoomAuthorization } from "../../../../../_lib/battle-room-strategy-validation.mjs";
import { requireDatabase } from "../../../../../_lib/database.mjs";
import { apiErrorResponse, jsonResponse, methodNotAllowed, optionsResponse } from "../../../../../_lib/http.mjs";
import { assertSameOrigin } from "../../../../../_lib/security.mjs";

async function handleGet(context) {
  assertSameOrigin(context.request);
  const snapshot = await getBattleRoomStrategySeries(
    requireDatabase(context.env),
    context.params?.code,
    normalizeStrategyRoomAuthorization(context.request),
    Math.floor(Date.now() / 1000),
  );
  return jsonResponse(context.request, { ok: true, ...snapshot });
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
