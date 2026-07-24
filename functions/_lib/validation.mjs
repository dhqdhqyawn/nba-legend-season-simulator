import { ALLOWED_IMAGE_TYPES, LIMITS } from "./config.mjs";
import { ApiError } from "./errors.mjs";

const textDecoder = new TextDecoder("utf-8", { fatal: true });
const LINEUP_PREFIX = "NBA82-";
const LINEUP_PAYLOAD_PATTERN = /^[A-Za-z0-9_-]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FEEDBACK_TYPES = new Set(["feedback", "bug", "feature"]);

function characterLength(value) {
  return Array.from(value).length;
}

function requiredText(value, field, maxCharacters) {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_input", `${field} 必须是字符串。`);
  }

  const normalized = value.trim();
  const length = characterLength(normalized);
  if (length === 0) {
    throw new ApiError(400, "invalid_input", `${field} 不能为空。`);
  }
  if (length > maxCharacters) {
    throw new ApiError(400, "invalid_input", `${field} 不能超过 ${maxCharacters} 个字符。`);
  }
  if (normalized.includes("\u0000")) {
    throw new ApiError(400, "invalid_input", `${field} 包含无效字符。`);
  }
  return normalized;
}

function optionalText(value, field, maxCharacters) {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_input", `${field} 必须是字符串。`);
  }
  const normalized = value.trim();
  if (characterLength(normalized) > maxCharacters) {
    throw new ApiError(400, "invalid_input", `${field} 不能超过 ${maxCharacters} 个字符。`);
  }
  if (normalized.includes("\u0000")) {
    throw new ApiError(400, "invalid_input", `${field} 包含无效字符。`);
  }
  return normalized;
}

function decodeBase64Url(value) {
  if (!LINEUP_PAYLOAD_PATTERN.test(value)) {
    throw new ApiError(400, "invalid_lineup_code", "阵容码包含无效字符。");
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new ApiError(400, "invalid_lineup_code", "阵容码不是有效的 Base64URL。");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  try {
    return textDecoder.decode(bytes);
  } catch {
    throw new ApiError(400, "invalid_lineup_code", "阵容码不是有效的 UTF-8 数据。");
  }
}

export function decodeAndValidateLineupCode(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return { lineupCode: "", payload: null };
  }
  const lineupCode = requiredText(value, "lineupCode", LIMITS.lineupCodeCharacters);
  if (!lineupCode.startsWith(LINEUP_PREFIX)) {
    throw new ApiError(400, "invalid_lineup_code", `阵容码必须以 ${LINEUP_PREFIX} 开头。`);
  }

  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(lineupCode.slice(LINEUP_PREFIX.length)));
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(400, "invalid_lineup_code", "阵容码内容不是有效 JSON。");
  }

  const validCards =
    Array.isArray(payload?.cards) &&
    payload.cards.length === 5 &&
    payload.cards.every((cardId) => {
      if (typeof cardId === "string") {
        return cardId.length > 0 && cardId.length <= 200;
      }
      return Number.isSafeInteger(cardId);
    });
  const uniqueCards = validCards && new Set(payload.cards.map(String)).size === 5;
  const validEra = ["modern", "balanced", "physical"].includes(payload?.era);
  const validInjury = Number.isFinite(payload?.injury) && payload.injury >= 0 && payload.injury <= 12;
  const validChemistry =
    Number.isFinite(payload?.chemistry) && payload.chemistry >= -8 && payload.chemistry <= 8;

  if (
    payload?.v !== 1 ||
    !validCards ||
    !uniqueCards ||
    !validEra ||
    !validInjury ||
    !validChemistry
  ) {
    throw new ApiError(400, "invalid_lineup_code", "阵容码结构或参数范围无效。");
  }

  return { lineupCode, payload };
}

export function normalizeFeedbackFields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "invalid_input", "请求内容必须是对象。");
  }

  const feedbackType = optionalText(input.feedbackType, "feedbackType", 20) || "feedback";
  if (!FEEDBACK_TYPES.has(feedbackType)) {
    throw new ApiError(400, "invalid_feedback_type", "反馈类型无效。");
  }
  const contactName = optionalText(
    input.contactName,
    "contactName",
    LIMITS.contactNameCharacters,
  );
  const title = optionalText(input.title, "title", LIMITS.titleCharacters);
  const contactEmail = optionalText(
    input.contactEmail,
    "contactEmail",
    LIMITS.contactEmailCharacters,
  ).toLowerCase();
  if (contactEmail && !CONTACT_EMAIL_PATTERN.test(contactEmail)) {
    throw new ApiError(400, "invalid_contact_email", "请填写有效的联系邮箱。");
  }
  const content = optionalText(input.content, "content", LIMITS.contentCharacters);
  const pageUrl = optionalText(input.pageUrl, "pageUrl", LIMITS.pageUrlCharacters);
  if (pageUrl) {
    let parsedUrl;
    try {
      parsedUrl = new URL(pageUrl);
    } catch {
      throw new ApiError(400, "invalid_page_url", "页面链接无效。");
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new ApiError(400, "invalid_page_url", "页面链接仅支持 HTTP 或 HTTPS。");
    }
  }
  const { lineupCode } = decodeAndValidateLineupCode(input.lineupCode);
  const honey = typeof input._honey === "string" ? input._honey.trim() : "";

  if (honey) {
    throw new ApiError(400, "spam_rejected", "提交未通过反滥用校验。");
  }

  return {
    feedbackType,
    contactName,
    title,
    contactEmail,
    content,
    pageUrl,
    lineupCode,
  };
}

function sanitizeImageName(value, index, mediaType) {
  const extensionByType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const fallback = `image-${index + 1}.${extensionByType[mediaType] ?? "bin"}`;
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value
    .replace(/[\\/]/g, "-")
    .replace(CONTROL_CHARACTERS, "")
    .trim();
  if (!cleaned) {
    return fallback;
  }
  return Array.from(cleaned).slice(0, LIMITS.imageNameCharacters).join("");
}

function matchesImageSignature(bytes, mediaType) {
  if (mediaType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (mediaType === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  if (mediaType === "image/gif") {
    if (bytes.length < 6) return false;
    const signature = String.fromCharCode(...bytes.slice(0, 6));
    return signature === "GIF87a" || signature === "GIF89a";
  }
  return false;
}

export function validateImages(images) {
  if (!Array.isArray(images)) {
    throw new ApiError(400, "invalid_images", "images 必须是数组。");
  }
  if (images.length > LIMITS.imageCount) {
    throw new ApiError(413, "too_many_images", `最多上传 ${LIMITS.imageCount} 张图片。`);
  }

  let totalBytes = 0;
  return images.map((image, index) => {
    const mediaType = String(image?.mediaType ?? "").toLowerCase();
    const bytes = image?.bytes instanceof Uint8Array ? image.bytes : new Uint8Array(image?.bytes ?? []);

    if (!ALLOWED_IMAGE_TYPES.includes(mediaType)) {
      throw new ApiError(400, "invalid_image_type", "图片仅支持 JPEG、PNG、WebP 或 GIF。");
    }
    if (bytes.byteLength === 0) {
      throw new ApiError(400, "empty_image", "图片文件不能为空。");
    }
    if (bytes.byteLength > LIMITS.imageBytes) {
      throw new ApiError(
        413,
        "image_too_large",
        `单张图片不能超过 ${Math.floor(LIMITS.imageBytes / 1_000)} KB。`,
      );
    }
    if (!matchesImageSignature(bytes, mediaType)) {
      throw new ApiError(400, "invalid_image_signature", "图片内容与声明的文件类型不一致。");
    }

    totalBytes += bytes.byteLength;
    if (totalBytes > LIMITS.totalImageBytes) {
      throw new ApiError(
        413,
        "images_too_large",
        `图片总大小不能超过 ${Math.floor(LIMITS.totalImageBytes / 1_000)} KB。`,
      );
    }

    return {
      name: sanitizeImageName(image?.name, index, mediaType),
      mediaType,
      bytes,
    };
  });
}

function decodeBase64(value) {
  const compact = String(value).replace(/\s/g, "");
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) {
    throw new ApiError(400, "invalid_image_data", "图片 Base64 数据无效。");
  }

  const padded = compact + "=".repeat((4 - (compact.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new ApiError(400, "invalid_image_data", "图片 Base64 数据无效。");
  }

  if (binary.length > LIMITS.imageBytes) {
    throw new ApiError(
      413,
      "image_too_large",
      `单张图片不能超过 ${Math.floor(LIMITS.imageBytes / 1_000)} KB。`,
    );
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function jsonImagesToBinary(rawImages) {
  if (rawImages === undefined || rawImages === null) {
    return [];
  }
  if (!Array.isArray(rawImages)) {
    throw new ApiError(400, "invalid_images", "images 必须是数组。");
  }
  if (rawImages.length > LIMITS.imageCount) {
    throw new ApiError(413, "too_many_images", `最多上传 ${LIMITS.imageCount} 张图片。`);
  }

  const images = rawImages.map((image, index) => {
    if (!image || typeof image !== "object" || Array.isArray(image)) {
      throw new ApiError(400, "invalid_image_data", `第 ${index + 1} 张图片格式无效。`);
    }

    let mediaType = String(image.type ?? image.mediaType ?? "").toLowerCase();
    let encoded = image.dataUrl ?? image.data;
    if (typeof encoded !== "string") {
      throw new ApiError(400, "invalid_image_data", `第 ${index + 1} 张图片缺少 Base64 数据。`);
    }

    const dataUrl = encoded.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
    if (dataUrl) {
      const dataUrlType = dataUrl[1].toLowerCase();
      if (mediaType && mediaType !== dataUrlType) {
        throw new ApiError(400, "invalid_image_type", "图片 data URL 与 type 不一致。");
      }
      mediaType = dataUrlType;
      encoded = dataUrl[2];
    }

    return {
      name: image.name,
      mediaType,
      bytes: decodeBase64(encoded),
    };
  });

  return validateImages(images);
}

async function readBodyWithLimit(request) {
  const declaredLength = Number.parseInt(request.headers.get("Content-Length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > LIMITS.requestBytes) {
    throw new ApiError(413, "request_too_large", "请求体过大。");
  }
  if (!request.body) {
    throw new ApiError(400, "empty_body", "请求体不能为空。");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITS.requestBytes) {
      await reader.cancel();
      throw new ApiError(413, "request_too_large", "请求体过大。");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isFileLike(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.size === "number"
  );
}

async function parseMultipart(bytes, contentType) {
  let form;
  try {
    form = await new Response(bytes, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new ApiError(400, "invalid_multipart", "multipart/form-data 请求无法解析。");
  }

  const fileValues = [
    ...form.getAll("images"),
    ...form.getAll("image"),
  ].filter(isFileLike);
  const images = [];

  for (const file of fileValues) {
    if (file.size === 0 && !file.name) continue;
    if (file.size > LIMITS.imageBytes) {
      throw new ApiError(
        413,
        "image_too_large",
        `单张图片不能超过 ${Math.floor(LIMITS.imageBytes / 1_000)} KB。`,
      );
    }
    images.push({
      name: file.name,
      mediaType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }

  return {
    fields: {
      feedbackType: form.get("feedbackType"),
      contactName: form.get("contactName"),
      title: form.get("title"),
      contactEmail: form.get("contactEmail"),
      content: form.get("content"),
      pageUrl: form.get("pageUrl"),
      lineupCode: form.get("lineupCode"),
      _honey: form.get("_honey"),
    },
    images: validateImages(images),
  };
}

function parseJson(bytes) {
  let value;
  try {
    value = JSON.parse(textDecoder.decode(bytes));
  } catch {
    throw new ApiError(400, "invalid_json", "JSON 请求无法解析。");
  }
  return {
    fields: value,
    images: jsonImagesToBinary(value?.images),
  };
}

export async function parseFeedbackRequest(request) {
  const contentType = request.headers.get("Content-Type") ?? "";
  const bytes = await readBodyWithLimit(request);
  let parsed;

  if (/^application\/json(?:\s*;|$)/i.test(contentType)) {
    parsed = parseJson(bytes);
  } else if (/^multipart\/form-data\s*;/i.test(contentType)) {
    parsed = await parseMultipart(bytes, contentType);
  } else {
    throw new ApiError(
      415,
      "unsupported_media_type",
      "仅支持 application/json 或 multipart/form-data。",
    );
  }

  return {
    ...normalizeFeedbackFields(parsed.fields),
    images: parsed.images,
  };
}
