PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  feedback_type TEXT NOT NULL DEFAULT 'feedback' CHECK (
    feedback_type IN ('feedback', 'bug', 'feature')
  ),
  contact_name TEXT NOT NULL DEFAULT '' CHECK (length(contact_name) <= 80),
  title TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 120),
  contact_email TEXT NOT NULL CHECK (
    contact_email = ''
    OR (
      length(contact_email) BETWEEN 3 AND 254
      AND contact_email LIKE '%_@_%._%'
    )
  ),
  content TEXT NOT NULL DEFAULT '' CHECK (length(content) <= 5000),
  page_url TEXT NOT NULL DEFAULT '' CHECK (
    length(page_url) <= 2048
    AND (
      page_url = ''
      OR page_url GLOB 'http://*'
      OR page_url GLOB 'https://*'
    )
  ),
  lineup_code TEXT NOT NULL DEFAULT '' CHECK (
    lineup_code = ''
    OR (
      length(lineup_code) BETWEEN 1 AND 4096
      AND lineup_code GLOB 'NBA82-*'
    )
  ),
  created_at TEXT NOT NULL,
  image_count INTEGER NOT NULL DEFAULT 0 CHECK (image_count BETWEEN 0 AND 3),
  email_status TEXT NOT NULL CHECK (
    email_status IN ('pending', 'accepted', 'failed', 'not_configured')
  ),
  email_updated_at TEXT,
  email_error TEXT,
  email_http_status INTEGER,
  client_hash TEXT NOT NULL CHECK (length(client_hash) = 64),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  user_agent TEXT NOT NULL DEFAULT '' CHECK (length(user_agent) <= 300)
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON feedback(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_content_hash
  ON feedback(content_hash);

CREATE TABLE IF NOT EXISTS feedback_images (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 2),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 120),
  media_type TEXT NOT NULL CHECK (
    media_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
  ),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 600000),
  image_data BLOB NOT NULL CHECK (
    typeof(image_data) = 'blob'
    AND length(image_data) = byte_size
  ),
  created_at TEXT NOT NULL,
  FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE,
  UNIQUE (feedback_id, position)
);

CREATE INDEX IF NOT EXISTS idx_feedback_images_feedback
  ON feedback_images(feedback_id, position);

CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  client_hash TEXT NOT NULL CHECK (length(client_hash) = 64),
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (client_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_feedback_rate_limits_window
  ON feedback_rate_limits(window_start);
