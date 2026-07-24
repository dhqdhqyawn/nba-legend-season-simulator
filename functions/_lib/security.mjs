import { ApiError } from "./errors.mjs";

const encoder = new TextEncoder();

export function assertSameOrigin(request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");

  if (origin && origin !== requestOrigin) {
    throw new ApiError(403, "cross_origin_forbidden", "只允许同源请求。");
  }
  if (fetchSite === "cross-site") {
    throw new ApiError(403, "cross_origin_forbidden", "只允许同源请求。");
  }
  return origin || null;
}

export function constantTimeEqual(left, right) {
  const leftBytes = encoder.encode(String(left ?? ""));
  const rightBytes = encoder.encode(String(right ?? ""));
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function extractAdminKey(request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    return bearer[1].trim();
  }
  return (request.headers.get("X-Admin-Key") ?? "").trim();
}

export function requireAdmin(request, env) {
  const configuredKey = String(env?.FEEDBACK_ADMIN_KEY ?? "");
  if (!configuredKey) {
    throw new ApiError(503, "admin_not_configured", "管理员密钥尚未配置。");
  }

  const providedKey = extractAdminKey(request);
  if (!providedKey || !constantTimeEqual(providedKey, configuredKey)) {
    throw new ApiError(401, "unauthorized", "管理员密钥无效。", {
      "WWW-Authenticate": 'Bearer realm="feedback-admin"',
    });
  }
}

function firstForwardedAddress(value) {
  return String(value ?? "").split(",")[0].trim();
}

export function clientAddress(request) {
  return (
    firstForwardedAddress(request.headers.get("CF-Connecting-IP")) ||
    firstForwardedAddress(request.headers.get("X-Forwarded-For")) ||
    "unknown"
  );
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function clientFingerprint(request, salt) {
  return sha256Hex(`${String(salt ?? "")}:${clientAddress(request)}`);
}

export function truncateUserAgent(value, maxCharacters) {
  return Array.from(String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, ""))
    .slice(0, maxCharacters)
    .join("");
}
