export const LIMITS = Object.freeze({
  requestBytes: 2_000_000,
  contactNameCharacters: 80,
  titleCharacters: 120,
  contactEmailCharacters: 254,
  contentCharacters: 5_000,
  pageUrlCharacters: 2_048,
  lineupCodeCharacters: 4_096,
  imageCount: 3,
  imageBytes: 600_000,
  totalImageBytes: 1_500_000,
  imageNameCharacters: 120,
  userAgentCharacters: 300,
  listPageSize: 30,
  listPageSizeMax: 50,
  cursorCharacters: 512,
});

export const ALLOWED_IMAGE_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const DEFAULT_EMAIL_TO = "3572280879@qq.com";
export const DEFAULT_RATE_LIMIT_MAX = 5;
export const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 600;
export const DEFAULT_WEBHOOK_TIMEOUT_MS = 5_000;

export function positiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}
