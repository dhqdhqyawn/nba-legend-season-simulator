import {
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
  LIMITS,
  positiveInteger,
} from "./config.mjs";
import { ApiError } from "./errors.mjs";

export function requireDatabase(env) {
  const database = env?.FEEDBACK_DB;
  if (!database || typeof database.prepare !== "function") {
    throw new ApiError(503, "database_not_configured", "D1 数据库绑定尚未配置。");
  }
  return database;
}

export async function enforceRateLimit(database, clientHash, nowMs, env) {
  const maxRequests = positiveInteger(
    env?.FEEDBACK_RATE_LIMIT_MAX,
    DEFAULT_RATE_LIMIT_MAX,
    { min: 1, max: 100 },
  );
  const windowSeconds = positiveInteger(
    env?.FEEDBACK_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
    { min: 60, max: 86_400 },
  );
  const nowSeconds = Math.floor(nowMs / 1_000);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;

  const row = await database
    .prepare(
      `INSERT INTO feedback_rate_limits (
        client_hash, window_start, request_count, last_seen_at
      ) VALUES (?1, ?2, 1, ?3)
      ON CONFLICT(client_hash, window_start) DO UPDATE SET
        request_count = request_count + 1,
        last_seen_at = excluded.last_seen_at
      RETURNING request_count`,
    )
    .bind(clientHash, windowStart, nowSeconds)
    .first();

  const requestCount = Number(row?.request_count ?? 0);
  if (requestCount > maxRequests) {
    const retryAfter = Math.max(1, windowStart + windowSeconds - nowSeconds);
    throw new ApiError(429, "rate_limited", "提交过于频繁，请稍后重试。", {
      "Retry-After": String(retryAfter),
    });
  }

  return { requestCount, maxRequests, windowStart, windowSeconds };
}

function exactArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export async function persistFeedback(database, record, images) {
  const statements = [
    database
      .prepare(
        `INSERT INTO feedback (
          id, feedback_type, contact_name, title, contact_email, content, page_url,
          lineup_code, created_at, image_count,
          email_status, client_hash, content_hash, user_agent
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
        )`,
      )
      .bind(
        record.id,
        record.feedbackType,
        record.contactName,
        record.title,
        record.contactEmail,
        record.content,
        record.pageUrl,
        record.lineupCode,
        record.createdAt,
        images.length,
        record.emailStatus,
        record.clientHash,
        record.contentHash,
        record.userAgent,
      ),
  ];

  images.forEach((image, index) => {
    statements.push(
      database
        .prepare(
          `INSERT INTO feedback_images (
            id, feedback_id, position, file_name, media_type, byte_size, image_data, created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        )
        .bind(
          image.id,
          record.id,
          index,
          image.name,
          image.mediaType,
          image.bytes.byteLength,
          exactArrayBuffer(image.bytes),
          record.createdAt,
        ),
    );
  });

  await database.batch(statements);
}

export async function updateEmailStatus(database, feedbackId, result, updatedAt) {
  await database
    .prepare(
      `UPDATE feedback
       SET email_status = ?1,
           email_updated_at = ?2,
           email_error = ?3,
           email_http_status = ?4
       WHERE id = ?5`,
    )
    .bind(
      result.status,
      updatedAt,
      result.errorCode ?? null,
      result.httpStatus ?? null,
      feedbackId,
    )
    .run();
}

export function scheduleRateLimitCleanup(context, database, nowMs) {
  if (!context || typeof context.waitUntil !== "function" || Math.random() >= 0.02) {
    return;
  }
  const cutoff = Math.floor(nowMs / 1_000) - 172_800;
  context.waitUntil(
    database
      .prepare("DELETE FROM feedback_rate_limits WHERE window_start < ?1")
      .bind(cutoff)
      .run()
      .catch((error) => console.error("Feedback rate-limit cleanup failed", error)),
  );
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function encodeListCursor(row) {
  const bytes = new TextEncoder().encode(JSON.stringify([row.createdAt, row.id]));
  return bytesToBase64Url(bytes);
}

export function decodeListCursor(value) {
  if (!value) return null;
  if (
    typeof value !== "string" ||
    value.length > LIMITS.cursorCharacters ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new ApiError(400, "invalid_cursor", "分页游标无效。");
  }

  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      !Number.isFinite(Date.parse(parsed[0])) ||
      typeof parsed[1] !== "string" ||
      parsed[1].length < 1 ||
      parsed[1].length > 100
    ) {
      throw new Error("invalid cursor payload");
    }
    return { createdAt: parsed[0], id: parsed[1] };
  } catch {
    throw new ApiError(400, "invalid_cursor", "分页游标无效。");
  }
}

function rowsFrom(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export async function listFeedback(database, { limit, cursor }) {
  const queryLimit = limit + 1;
  let result;

  if (cursor) {
    result = await database
      .prepare(
        `SELECT
          id,
          feedback_type AS feedbackType,
          contact_name AS contactName,
          title,
          contact_email AS contactEmail,
          content,
          page_url AS pageUrl,
          lineup_code AS lineupCode,
          created_at AS createdAt,
          image_count AS imageCount,
          email_status AS emailStatus,
          email_updated_at AS emailUpdatedAt,
          email_error AS emailError,
          email_http_status AS emailHttpStatus
        FROM feedback
        WHERE created_at < ?1 OR (created_at = ?1 AND id < ?2)
        ORDER BY created_at DESC, id DESC
        LIMIT ?3`,
      )
      .bind(cursor.createdAt, cursor.id, queryLimit)
      .all();
  } else {
    result = await database
      .prepare(
        `SELECT
          id,
          feedback_type AS feedbackType,
          contact_name AS contactName,
          title,
          contact_email AS contactEmail,
          content,
          page_url AS pageUrl,
          lineup_code AS lineupCode,
          created_at AS createdAt,
          image_count AS imageCount,
          email_status AS emailStatus,
          email_updated_at AS emailUpdatedAt,
          email_error AS emailError,
          email_http_status AS emailHttpStatus
        FROM feedback
        ORDER BY created_at DESC, id DESC
        LIMIT ?1`,
      )
      .bind(queryLimit)
      .all();
  }

  const items = rowsFrom(result);
  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  const imagesByFeedback = new Map();
  if (items.length > 0) {
    const placeholders = items.map((_, index) => `?${index + 1}`).join(", ");
    const imageResult = await database
      .prepare(
        `SELECT
          id,
          feedback_id AS feedbackId,
          position,
          file_name AS fileName,
          media_type AS mediaType,
          byte_size AS byteSize
        FROM feedback_images
        WHERE feedback_id IN (${placeholders})
        ORDER BY feedback_id, position`,
      )
      .bind(...items.map((item) => item.id))
      .all();

    for (const image of rowsFrom(imageResult)) {
      const existing = imagesByFeedback.get(image.feedbackId) ?? [];
      existing.push({
        id: image.id,
        fileName: image.fileName,
        mediaType: image.mediaType,
        byteSize: Number(image.byteSize),
      });
      imagesByFeedback.set(image.feedbackId, existing);
    }
  }

  const normalizedItems = items.map((item) => ({
    ...item,
    imageCount: Number(item.imageCount),
    emailHttpStatus:
      item.emailHttpStatus === null || item.emailHttpStatus === undefined
        ? null
        : Number(item.emailHttpStatus),
    images: imagesByFeedback.get(item.id) ?? [],
  }));
  const lastItem = normalizedItems.at(-1);

  return {
    items: normalizedItems,
    hasMore,
    nextCursor: hasMore && lastItem ? encodeListCursor(lastItem) : null,
  };
}

export async function getFeedbackImage(database, imageId) {
  return database
    .prepare(
      `SELECT
        image_data AS imageData,
        file_name AS fileName,
        media_type AS mediaType,
        byte_size AS byteSize
      FROM feedback_images
      WHERE id = ?1`,
    )
    .bind(imageId)
    .first();
}

export function normalizeBlob(value) {
  if (value instanceof ArrayBuffer) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value).buffer;
  }
  throw new ApiError(500, "invalid_image_record", "图片记录无法读取。");
}
