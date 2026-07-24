import { getFeedbackImage, normalizeBlob, requireDatabase } from "../../../_lib/database.mjs";
import { ApiError } from "../../../_lib/errors.mjs";
import {
  apiErrorResponse,
  methodNotAllowed,
  optionsResponse,
} from "../../../_lib/http.mjs";
import { assertSameOrigin, requireAdmin } from "../../../_lib/security.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function contentDisposition(fileName) {
  const asciiName = String(fileName ?? "feedback-image")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 120);
  const encodedName = encodeURIComponent(String(fileName ?? "feedback-image")).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${asciiName || "feedback-image"}"; filename*=UTF-8''${encodedName}`;
}

function imageResponse(request, image) {
  const body = normalizeBlob(image.imageData);
  const origin = request.headers.get("Origin");
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Disposition": contentDisposition(image.fileName),
    "Content-Length": String(body.byteLength),
    "Content-Type": image.mediaType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && origin === new URL(request.url).origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return new Response(body, { status: 200, headers });
}

async function handleGet(context) {
  const { request, env } = context;
  assertSameOrigin(request);
  requireAdmin(request, env);

  const imageId = String(context.params?.id ?? "");
  if (!UUID_PATTERN.test(imageId)) {
    throw new ApiError(400, "invalid_image_id", "图片 ID 无效。");
  }

  const database = requireDatabase(env);
  const image = await getFeedbackImage(database, imageId);
  if (!image) {
    throw new ApiError(404, "image_not_found", "图片不存在。");
  }
  return imageResponse(request, image);
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
