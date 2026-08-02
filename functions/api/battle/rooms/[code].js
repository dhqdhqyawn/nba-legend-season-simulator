import { getBattleRoom } from "../../../_lib/battle-rooms.mjs";
import { requireDatabase } from "../../../_lib/database.mjs";
import { apiErrorResponse, jsonResponse, methodNotAllowed, optionsResponse } from "../../../_lib/http.mjs";
import { assertSameOrigin } from "../../../_lib/security.mjs";

async function handleGet(context) {
  assertSameOrigin(context.request);
  const database = requireDatabase(context.env);
  const room = await getBattleRoom(
    database,
    context.params?.code,
    Math.floor(Date.now() / 1000),
  );
  return jsonResponse(context.request, { ok: true, room });
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
