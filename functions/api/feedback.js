import { LIMITS } from "../_lib/config.mjs";
import {
  enforceRateLimit,
  persistFeedback,
  requireDatabase,
  scheduleRateLimitCleanup,
  updateEmailStatus,
} from "../_lib/database.mjs";
import { apiErrorResponse, jsonResponse, methodNotAllowed, optionsResponse } from "../_lib/http.mjs";
import { sendFeedbackNotification } from "../_lib/notification.mjs";
import {
  assertSameOrigin,
  clientFingerprint,
  sha256Hex,
  truncateUserAgent,
} from "../_lib/security.mjs";
import { parseFeedbackRequest } from "../_lib/validation.mjs";

async function handlePost(context) {
  const { request, env } = context;
  assertSameOrigin(request);

  const database = requireDatabase(env);
  const nowMs = Date.now();
  const clientHash = await clientFingerprint(
    request,
    env?.RATE_LIMIT_SALT || env?.FEEDBACK_ADMIN_KEY || "nba82-feedback-rate-limit-v1",
  );
  await enforceRateLimit(database, clientHash, nowMs, env);

  const submission = await parseFeedbackRequest(request);
  const createdAt = new Date(nowMs).toISOString();
  const record = {
    id: crypto.randomUUID(),
    feedbackType: submission.feedbackType,
    contactName: submission.contactName,
    title: submission.title,
    contactEmail: submission.contactEmail,
    content: submission.content,
    pageUrl: submission.pageUrl,
    lineupCode: submission.lineupCode,
    createdAt,
    emailStatus: env?.EMAIL_WEBHOOK_URL ? "pending" : "not_configured",
    clientHash,
    contentHash: await sha256Hex(
      [
        submission.feedbackType,
        submission.contactName,
        submission.title,
        submission.contactEmail,
        submission.content,
        submission.pageUrl,
        submission.lineupCode,
      ].join("\n"),
    ),
    userAgent: truncateUserAgent(
      request.headers.get("User-Agent"),
      LIMITS.userAgentCharacters,
    ),
  };
  const images = submission.images.map((image) => ({
    ...image,
    id: crypto.randomUUID(),
  }));

  await persistFeedback(database, record, images);
  scheduleRateLimitCleanup(context, database, nowMs);

  const notification = await sendFeedbackNotification(env, record, images.length);
  try {
    await updateEmailStatus(database, record.id, notification, new Date().toISOString());
  } catch (error) {
    console.error("Feedback email status update failed", {
      feedbackId: record.id,
      error,
    });
  }

  return jsonResponse(
    request,
    {
      ok: true,
      feedback: {
        id: record.id,
        createdAt,
        imageCount: images.length,
      },
      emailStatus: notification.status,
      emailStatusMessage: notification.message,
      emailDeliveryVerified: false,
    },
    201,
  );
}

export async function onRequest(context) {
  try {
    if (context.request.method === "POST") {
      return await handlePost(context);
    }
    if (context.request.method === "OPTIONS") {
      return optionsResponse(context.request, ["POST", "OPTIONS"]);
    }
    return methodNotAllowed(context.request, ["POST", "OPTIONS"]);
  } catch (error) {
    return apiErrorResponse(context.request, error);
  }
}
