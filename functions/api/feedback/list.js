import { LIMITS, positiveInteger } from "../../_lib/config.mjs";
import {
  decodeListCursor,
  listFeedback,
  requireDatabase,
} from "../../_lib/database.mjs";
import { ApiError } from "../../_lib/errors.mjs";
import {
  apiErrorResponse,
  jsonResponse,
  methodNotAllowed,
  optionsResponse,
} from "../../_lib/http.mjs";
import { assertSameOrigin, requireAdmin } from "../../_lib/security.mjs";

function parseLimit(value) {
  if (value !== null && !/^\d+$/.test(value)) {
    throw new ApiError(400, "invalid_limit", "limit 必须是正整数。");
  }
  return positiveInteger(value, LIMITS.listPageSize, {
    min: 1,
    max: LIMITS.listPageSizeMax,
  });
}

async function handleGet(context) {
  const { request, env } = context;
  assertSameOrigin(request);
  requireAdmin(request, env);

  const database = requireDatabase(env);
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeListCursor(url.searchParams.get("cursor"));
  const page = await listFeedback(database, { limit, cursor });

  return jsonResponse(request, {
    ok: true,
    ...page,
  });
}

export async function onRequest(context) {
  try {
    if (context.request.method === "GET") {
      return await handleGet(context);
    }
    if (context.request.method === "OPTIONS") {
      return optionsResponse(context.request, ["GET", "OPTIONS"]);
    }
    return methodNotAllowed(context.request, ["GET", "OPTIONS"]);
  } catch (error) {
    return apiErrorResponse(context.request, error);
  }
}
