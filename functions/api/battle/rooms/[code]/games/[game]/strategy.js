import { submitBattleRoomGameStrategy } from "../../../../../../_lib/battle-room-strategy-series.mjs";
import { normalizeStrategyRoomSubmission } from "../../../../../../_lib/battle-room-strategy-validation.mjs";
import { parseRoomJson } from "../../../../../../_lib/battle-rooms-validation.mjs";
import { requireDatabase } from "../../../../../../_lib/database.mjs";
import { apiErrorResponse, jsonResponse, methodNotAllowed, optionsResponse } from "../../../../../../_lib/http.mjs";
import { assertSameOrigin } from "../../../../../../_lib/security.mjs";

async function handlePost(context) {
  assertSameOrigin(context.request);
  const snapshot = await submitBattleRoomGameStrategy(
    requireDatabase(context.env),
    context.params?.code,
    context.params?.game,
    normalizeStrategyRoomSubmission(await parseRoomJson(context.request)),
    Math.floor(Date.now() / 1000),
  );
  return jsonResponse(context.request, { ok: true, ...snapshot });
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
