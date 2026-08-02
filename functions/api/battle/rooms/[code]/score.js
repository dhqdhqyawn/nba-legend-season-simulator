import { scoreBattleRoomRound } from "../../../../_lib/battle-rooms.mjs";
import {
  normalizeRoomScoreSubmission,
  parseRoomJson,
} from "../../../../_lib/battle-rooms-validation.mjs";
import { requireDatabase } from "../../../../_lib/database.mjs";
import { apiErrorResponse, jsonResponse, methodNotAllowed, optionsResponse } from "../../../../_lib/http.mjs";
import { assertSameOrigin } from "../../../../_lib/security.mjs";

async function handlePost(context) {
  assertSameOrigin(context.request);
  const database = requireDatabase(context.env);
  const submission = normalizeRoomScoreSubmission(await parseRoomJson(context.request));
  const room = await scoreBattleRoomRound(
    database,
    context.params?.code,
    submission,
    Math.floor(Date.now() / 1000),
  );
  return jsonResponse(context.request, { ok: true, room });
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
