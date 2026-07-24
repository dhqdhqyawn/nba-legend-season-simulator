import { isApiError } from "./errors.mjs";
import { assertSameOrigin } from "./security.mjs";

const BASE_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
});

function sameOriginCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  if (origin !== new URL(request.url).origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

export function jsonResponse(request, body, status = 200, extraHeaders = undefined) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...BASE_HEADERS,
      ...sameOriginCorsHeaders(request),
      ...(extraHeaders ?? {}),
    },
  });
}

export function optionsResponse(request, methods) {
  assertSameOrigin(request);
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Admin-Key",
    "Access-Control-Allow-Methods": methods.join(", "),
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return new Response(null, { status: 204, headers });
}

export function methodNotAllowed(request, methods) {
  return jsonResponse(
    request,
    {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "请求方法不受支持。",
      },
    },
    405,
    { Allow: methods.join(", ") },
  );
}

export function apiErrorResponse(request, error) {
  if (isApiError(error)) {
    return jsonResponse(
      request,
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      },
      error.status,
      error.headers,
    );
  }

  console.error("Unhandled feedback API error", error);
  return jsonResponse(
    request,
    {
      ok: false,
      error: {
        code: "internal_error",
        message: "服务暂时不可用，请稍后重试。",
      },
    },
    500,
  );
}
