import test from "node:test";
import assert from "node:assert/strict";

import { LIMITS } from "../_lib/config.mjs";
import {
  decodeListCursor,
  encodeListCursor,
} from "../_lib/database.mjs";
import { ApiError } from "../_lib/errors.mjs";
import {
  buildNotificationPayload,
  sendFeedbackNotification,
} from "../_lib/notification.mjs";
import {
  assertSameOrigin,
  constantTimeEqual,
  requireAdmin,
} from "../_lib/security.mjs";
import {
  jsonImagesToBinary,
  normalizeFeedbackFields,
  parseFeedbackRequest,
  validateImages,
} from "../_lib/validation.mjs";

function lineupCode(overrides = {}) {
  const payload = {
    v: 1,
    cards: ["card-a", "card-b", "card-c", "card-d", "card-e"],
    era: "modern",
    injury: 5,
    chemistry: 0,
    ...overrides,
  };
  return `NBA82-${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

function feedbackRecord() {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    feedbackType: "bug",
    contactName: "测试玩家",
    title: "模拟结果异常",
    contactEmail: "player@example.com",
    content: "第五场结束后战绩没有更新。",
    pageUrl: "https://game.example/results",
    lineupCode: lineupCode(),
    createdAt: "2026-07-23T08:00:00.000Z",
  };
}

function pngBytes() {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

test("normalizes valid feedback fields", () => {
  const fields = normalizeFeedbackFields({
    feedbackType: "bug",
    contactName: "  玩家  ",
    title: "  标题  ",
    contactEmail: " PLAYER@example.com ",
    content: "  正文  ",
    pageUrl: " https://game.example/results ",
    lineupCode: lineupCode(),
    _honey: "",
  });

  assert.equal(fields.feedbackType, "bug");
  assert.equal(fields.contactName, "玩家");
  assert.equal(fields.title, "标题");
  assert.equal(fields.contactEmail, "player@example.com");
  assert.equal(fields.content, "正文");
  assert.equal(fields.pageUrl, "https://game.example/results");
  assert.match(fields.lineupCode, /^NBA82-/);
});

test("accepts a feedback form with every user field left blank", () => {
  const fields = normalizeFeedbackFields({ _honey: "" });

  assert.equal(fields.feedbackType, "feedback");
  assert.equal(fields.contactName, "");
  assert.equal(fields.title, "");
  assert.equal(fields.contactEmail, "");
  assert.equal(fields.content, "");
  assert.equal(fields.pageUrl, "");
  assert.equal(fields.lineupCode, "");
});

test("rejects malformed lineup payloads and honeypot submissions", () => {
  assert.throws(
    () =>
      normalizeFeedbackFields({
        title: "标题",
        contactEmail: "player@example.com",
        content: "正文",
        lineupCode: lineupCode({ cards: ["same", "same", "c", "d", "e"] }),
      }),
    (error) => error instanceof ApiError && error.code === "invalid_lineup_code",
  );

  assert.throws(
    () =>
      normalizeFeedbackFields({
        title: "标题",
        contactEmail: "player@example.com",
        content: "正文",
        lineupCode: lineupCode(),
        _honey: "bot",
      }),
    (error) => error instanceof ApiError && error.code === "spam_rejected",
  );
});

test("enforces text length limits", () => {
  assert.throws(
    () =>
      normalizeFeedbackFields({
        title: "x".repeat(LIMITS.titleCharacters + 1),
        contactEmail: "player@example.com",
        content: "正文",
        lineupCode: lineupCode(),
      }),
    (error) => error instanceof ApiError && error.code === "invalid_input",
  );
});

test("validates contact email only when one is supplied", () => {
  assert.equal(normalizeFeedbackFields({ contactEmail: "" }).contactEmail, "");
  assert.throws(
    () =>
      normalizeFeedbackFields({
        title: "标题",
        contactEmail: "not-an-email",
        content: "正文",
        lineupCode: "",
      }),
    (error) => error instanceof ApiError && error.code === "invalid_contact_email",
  );
});

test("rejects invalid feedback types and non-http page URLs", () => {
  assert.throws(
    () => normalizeFeedbackFields({ feedbackType: "other" }),
    (error) => error instanceof ApiError && error.code === "invalid_feedback_type",
  );
  assert.throws(
    () => normalizeFeedbackFields({ pageUrl: "javascript:alert(1)" }),
    (error) => error instanceof ApiError && error.code === "invalid_page_url",
  );
});

test("accepts valid image signatures and rejects disguised files", () => {
  const images = validateImages([
    {
      name: "\u0000\u0001../screen.png",
      mediaType: "image/png",
      bytes: pngBytes(),
    },
  ]);

  assert.equal(images[0].name, "..-screen.png");
  assert.equal(images[0].bytes.byteLength, 8);

  assert.throws(
    () =>
      validateImages([
        {
          name: "fake.png",
          mediaType: "image/png",
          bytes: Uint8Array.from([0x3c, 0x73, 0x76, 0x67]),
        },
      ]),
    (error) => error instanceof ApiError && error.code === "invalid_image_signature",
  );
});

test("enforces per-image byte limit", () => {
  const bytes = new Uint8Array(LIMITS.imageBytes + 1);
  bytes.set([0xff, 0xd8, 0xff]);

  assert.throws(
    () =>
      validateImages([
        {
          name: "large.jpg",
          mediaType: "image/jpeg",
          bytes,
        },
      ]),
    (error) => error instanceof ApiError && error.code === "image_too_large",
  );
});

test("decodes JSON data URL images", () => {
  const encoded = Buffer.from(pngBytes()).toString("base64");
  const images = jsonImagesToBinary([
    {
      name: "screen.png",
      type: "image/png",
      dataUrl: `data:image/png;base64,${encoded}`,
    },
  ]);

  assert.equal(images.length, 1);
  assert.deepEqual(images[0].bytes, pngBytes());
});

test("parses an application/json feedback request", async () => {
  const request = new Request("https://game.example/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://game.example",
    },
    body: JSON.stringify({
      feedbackType: "feature",
      contactName: "玩家一号",
      title: "结果页",
      contactEmail: "player@example.com",
      content: "按钮在窄屏上被遮挡。",
      pageUrl: "https://game.example/results",
      lineupCode: lineupCode(),
      images: [],
    }),
  });

  const parsed = await parseFeedbackRequest(request);
  assert.equal(parsed.feedbackType, "feature");
  assert.equal(parsed.contactName, "玩家一号");
  assert.equal(parsed.title, "结果页");
  assert.equal(parsed.contactEmail, "player@example.com");
  assert.equal(parsed.pageUrl, "https://game.example/results");
  assert.equal(parsed.images.length, 0);
});

test("allows same-origin requests and rejects cross-origin requests", () => {
  assert.equal(
    assertSameOrigin(
      new Request("https://game.example/api/feedback", {
        headers: { Origin: "https://game.example" },
      }),
    ),
    "https://game.example",
  );

  assert.throws(
    () =>
      assertSameOrigin(
        new Request("https://game.example/api/feedback", {
          headers: { Origin: "https://other.example" },
        }),
      ),
    (error) => error instanceof ApiError && error.code === "cross_origin_forbidden",
  );
});

test("checks administrator keys without accepting partial matches", () => {
  assert.equal(constantTimeEqual("correct-key", "correct-key"), true);
  assert.equal(constantTimeEqual("correct-key", "correct"), false);

  const request = new Request("https://game.example/api/feedback/list", {
    headers: { Authorization: "Bearer correct-key" },
  });
  assert.doesNotThrow(() => requireAdmin(request, { FEEDBACK_ADMIN_KEY: "correct-key" }));
  assert.throws(
    () => requireAdmin(request, { FEEDBACK_ADMIN_KEY: "other-key" }),
    (error) => error instanceof ApiError && error.code === "unauthorized",
  );
});

test("round-trips list cursors and rejects invalid cursors", () => {
  const row = {
    createdAt: "2026-07-23T08:00:00.000Z",
    id: "123e4567-e89b-42d3-a456-426614174000",
  };
  const encoded = encodeListCursor(row);

  assert.deepEqual(decodeListCursor(encoded), row);
  assert.throws(
    () => decodeListCursor("not*base64url"),
    (error) => error instanceof ApiError && error.code === "invalid_cursor",
  );
});

test("builds a FormSubmit-compatible notification payload", () => {
  const payload = buildNotificationPayload(feedbackRecord(), 2, "3572280879@qq.com");

  assert.equal(payload.to, "3572280879@qq.com");
  assert.equal(payload.reply_to, "player@example.com");
  assert.equal(payload.feedback_type, "问题反馈");
  assert.equal(payload.contact_name, "测试玩家");
  assert.equal(payload.page_url, "https://game.example/results");
  assert.equal(payload._template, "table");
  assert.match(payload._subject, /模拟结果异常/);
  assert.equal(payload.image_count, 2);
});

test("omits reply_to when an optional contact email is blank", () => {
  const payload = buildNotificationPayload(
    { ...feedbackRecord(), contactEmail: "", title: "" },
    0,
    "3572280879@qq.com",
  );

  assert.equal("reply_to" in payload, false);
  assert.match(payload._subject, /无主题/);
});

test("reports not_configured without calling a webhook", async () => {
  let called = false;
  const result = await sendFeedbackNotification(
    {},
    feedbackRecord(),
    0,
    async () => {
      called = true;
      return new Response();
    },
  );

  assert.equal(called, false);
  assert.equal(result.status, "not_configured");
  assert.equal(result.deliveryVerified, false);
});

test("reports webhook acceptance without claiming delivery", async () => {
  let requestBody;
  let requestHeaders;
  const result = await sendFeedbackNotification(
    {
      EMAIL_WEBHOOK_URL: "https://formsubmit.co/ajax/3572280879@qq.com",
      FEEDBACK_EMAIL_TO: "3572280879@qq.com",
    },
    feedbackRecord(),
    1,
    async (_url, options) => {
      requestBody = JSON.parse(options.body);
      requestHeaders = options.headers;
      return new Response('{"success":true}', { status: 202 });
    },
  );

  assert.equal(requestBody.to, "3572280879@qq.com");
  assert.equal(requestHeaders.Origin, "https://game.example");
  assert.equal(requestHeaders.Referer, "https://game.example/");
  assert.equal(result.status, "accepted");
  assert.equal(result.httpStatus, 202);
  assert.equal(result.deliveryVerified, false);
  assert.match(result.message, /尚未验证/);
});

test("reports a provider activation requirement instead of a false acceptance", async () => {
  const result = await sendFeedbackNotification(
    { EMAIL_WEBHOOK_URL: "https://formsubmit.co/ajax/3572280879@qq.com" },
    feedbackRecord(),
    0,
    async () =>
      new Response(
        JSON.stringify({
          success: "false",
          message: "This form needs Activation.",
        }),
        { status: 200 },
      ),
  );

  assert.equal(result.status, "pending_activation");
  assert.equal(result.errorCode, "webhook_needs_activation");
  assert.equal(result.deliveryVerified, false);
});

test("keeps webhook failures distinct from persistence success", async () => {
  const result = await sendFeedbackNotification(
    { EMAIL_WEBHOOK_URL: "https://hooks.example/feedback" },
    feedbackRecord(),
    0,
    async () => new Response("failure", { status: 503 }),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.httpStatus, 503);
  assert.equal(result.errorCode, "webhook_http_503");
  assert.equal(result.deliveryVerified, false);
});
