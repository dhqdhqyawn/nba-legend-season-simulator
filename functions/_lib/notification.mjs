import {
  DEFAULT_EMAIL_TO,
  DEFAULT_WEBHOOK_TIMEOUT_MS,
  positiveInteger,
} from "./config.mjs";

export function buildNotificationPayload(record, imageCount, emailTo) {
  const typeLabels = {
    feedback: "意见反馈",
    bug: "问题反馈",
    feature: "功能建议",
  };
  const typeLabel = typeLabels[record.feedbackType] || typeLabels.feedback;
  const subject = record.title || "无主题";
  const payload = {
    event: "feedback.created",
    to: emailTo,
    feedback_id: record.id,
    _subject: `[NBA82 ${typeLabel}] ${subject}`,
    _template: "table",
    name: "NBA82 H5 反馈后台",
    feedback_type: typeLabel,
    contact_name: record.contactName || "未填写",
    title: subject,
    contact_email: record.contactEmail,
    message: record.content || "未填写",
    page_url: record.pageUrl || "未填写",
    lineup_code: record.lineupCode,
    image_count: imageCount,
    image_note: imageCount > 0 ? "图片已保存到 D1，请在反馈管理页查看。" : "无图片。",
    submitted_at: record.createdAt,
  };
  if (record.contactEmail) payload.reply_to = record.contactEmail;
  return payload;
}

function statusMessage(status) {
  if (status === "accepted") {
    return "通知 webhook 已接受请求，但邮件是否送达尚未验证。";
  }
  if (status === "failed") {
    return "反馈已保存，但通知 webhook 调用失败。";
  }
  return "反馈已保存；通知 webhook 尚未配置，因此未尝试发信。";
}

function notificationOrigin(env, record) {
  const candidates = [
    record?.pageUrl,
    env?.FEEDBACK_PUBLIC_ORIGIN,
    "https://nba-legend-season-simulator.pages.dev/",
  ];

  for (const candidate of candidates) {
    try {
      const url = new URL(String(candidate ?? "").trim());
      if (url.protocol === "https:" || url.protocol === "http:") {
        return `${url.origin}/`;
      }
    } catch {
      // Try the next trusted fallback.
    }
  }

  return "https://nba-legend-season-simulator.pages.dev/";
}

export async function sendFeedbackNotification(env, record, imageCount, fetchImpl = fetch) {
  const webhookUrl = String(env?.EMAIL_WEBHOOK_URL ?? "").trim();
  if (!webhookUrl) {
    return {
      status: "not_configured",
      deliveryVerified: false,
      message: statusMessage("not_configured"),
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
    if (parsedUrl.protocol !== "https:") {
      throw new Error("webhook URL must use HTTPS");
    }
  } catch {
    return {
      status: "failed",
      deliveryVerified: false,
      errorCode: "invalid_webhook_url",
      message: "反馈已保存，但 EMAIL_WEBHOOK_URL 配置无效。",
    };
  }

  const emailTo = String(env?.FEEDBACK_EMAIL_TO ?? DEFAULT_EMAIL_TO).trim() || DEFAULT_EMAIL_TO;
  const timeoutMs = positiveInteger(
    env?.EMAIL_WEBHOOK_TIMEOUT_MS,
    DEFAULT_WEBHOOK_TIMEOUT_MS,
    { min: 1_000, max: 15_000 },
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const publicOrigin = notificationOrigin(env, record);
  headers.Origin = new URL(publicOrigin).origin;
  headers.Referer = publicOrigin;
  const token = String(env?.EMAIL_WEBHOOK_BEARER_TOKEN ?? "").trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetchImpl(parsedUrl.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(buildNotificationPayload(record, imageCount, emailTo)),
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        status: "failed",
        deliveryVerified: false,
        httpStatus: response.status,
        errorCode: `webhook_http_${response.status}`,
        message: statusMessage("failed"),
      };
    }

    const responseText = await response.text();
    if (responseText) {
      try {
        const providerResult = JSON.parse(responseText);
        if (String(providerResult?.success).toLowerCase() === "false") {
          const needsActivation = /activat/i.test(String(providerResult?.message ?? ""));
          return {
            status: needsActivation ? "pending_activation" : "failed",
            deliveryVerified: false,
            httpStatus: response.status,
            errorCode: needsActivation ? "webhook_needs_activation" : "webhook_rejected",
            message: needsActivation
              ? "反馈已保存；邮箱通知服务尚待激活。"
              : statusMessage("failed"),
          };
        }
      } catch {
        // Some webhook providers return a successful non-JSON response.
      }
    }

    return {
      status: "accepted",
      deliveryVerified: false,
      httpStatus: response.status,
      message: statusMessage("accepted"),
    };
  } catch (error) {
    return {
      status: "failed",
      deliveryVerified: false,
      errorCode: error?.name === "AbortError" ? "webhook_timeout" : "webhook_request_failed",
      message: statusMessage("failed"),
    };
  } finally {
    clearTimeout(timeout);
  }
}
