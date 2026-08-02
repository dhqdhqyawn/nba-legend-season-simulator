import {
  enforceBattleRoomRateLimit,
  joinBattleRoom,
  scheduleBattleRoomCleanup,
} from "../../../../_lib/battle-rooms.mjs";
import {
  normalizeRoomSubmission,
  parseRoomJson,
} from "../../../../_lib/battle-rooms-validation.mjs";
import { requireDatabase } from "../../../../_lib/database.mjs";
import { apiErrorResponse, jsonResponse, methodNotAllowed, optionsResponse } from "../../../../_lib/http.mjs";
import { assertSameOrigin, clientFingerprint } from "../../../../_lib/security.mjs";

async function handlePost(context) {
  const { request, env } = context;
  assertSameOrigin(request);
  const database = requireDatabase(env);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const clientHash = await clientFingerprint(
    request,
    env?.RATE_LIMIT_SALT || env?.FEEDBACK_ADMIN_KEY || "nba5-room-rate-limit-v1",
  );
  await enforceBattleRoomRateLimit(database, clientHash, "join", nowSeconds, env);
  const submission = normalizeRoomSubmission(await parseRoomJson(request), "guest");
  const joined = await joinBattleRoom(database, context.params?.code, submission, nowSeconds);
  scheduleBattleRoomCleanup(context, database, nowSeconds);
  return jsonResponse(request, {
    ok: true,
    room: joined.room,
    session: { role: "guest", token: joined.sessionToken },
  });
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
