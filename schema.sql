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

CREATE TABLE IF NOT EXISTS battle_rooms (
  room_code TEXT PRIMARY KEY CHECK (
    length(room_code) = 8
    AND room_code NOT GLOB '*[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]*'
  ),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready')),
  host_name TEXT NOT NULL CHECK (length(host_name) BETWEEN 1 AND 12),
  host_lineup_code TEXT NOT NULL CHECK (
    length(host_lineup_code) = 42
    AND host_lineup_code GLOB 'NBA5-S1-*'
  ),
  guest_name TEXT CHECK (guest_name IS NULL OR length(guest_name) BETWEEN 1 AND 12),
  guest_lineup_code TEXT CHECK (
    guest_lineup_code IS NULL
    OR (
      length(guest_lineup_code) = 42
      AND guest_lineup_code GLOB 'NBA5-S1-*'
    )
  ),
  protocol_version TEXT NOT NULL CHECK (length(protocol_version) BETWEEN 1 AND 100),
  match_seed TEXT CHECK (match_seed IS NULL OR length(match_seed) BETWEEN 16 AND 100),
  created_at INTEGER NOT NULL,
  joined_at INTEGER,
  expires_at INTEGER NOT NULL,
  CHECK (
    (status = 'waiting' AND guest_name IS NULL AND guest_lineup_code IS NULL
      AND match_seed IS NULL AND joined_at IS NULL)
    OR
    (status = 'ready' AND guest_name IS NOT NULL AND guest_lineup_code IS NOT NULL
      AND match_seed IS NOT NULL AND joined_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_battle_rooms_expires_at
  ON battle_rooms(expires_at);

CREATE TABLE IF NOT EXISTS battle_rooms_v2 (
  room_code TEXT PRIMARY KEY CHECK (
    length(room_code) = 8
    AND room_code NOT GLOB '*[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]*'
  ),
  status TEXT NOT NULL DEFAULT 'waiting_guest' CHECK (
    status IN ('waiting_guest', 'selecting', 'ready', 'complete')
  ),
  host_name TEXT NOT NULL CHECK (length(host_name) BETWEEN 1 AND 12),
  host_token_hash TEXT NOT NULL CHECK (length(host_token_hash) = 64),
  host_lineup_code TEXT CHECK (
    host_lineup_code IS NULL
    OR (length(host_lineup_code) = 42 AND host_lineup_code GLOB 'NBA5-S1-*')
  ),
  host_ready_at INTEGER,
  guest_name TEXT CHECK (guest_name IS NULL OR length(guest_name) BETWEEN 1 AND 12),
  guest_token_hash TEXT CHECK (guest_token_hash IS NULL OR length(guest_token_hash) = 64),
  guest_lineup_code TEXT CHECK (
    guest_lineup_code IS NULL
    OR (length(guest_lineup_code) = 42 AND guest_lineup_code GLOB 'NBA5-S1-*')
  ),
  guest_ready_at INTEGER,
  protocol_version TEXT NOT NULL CHECK (length(protocol_version) BETWEEN 1 AND 100),
  match_seed TEXT CHECK (match_seed IS NULL OR length(match_seed) BETWEEN 16 AND 100),
  created_at INTEGER NOT NULL,
  joined_at INTEGER,
  started_at INTEGER,
  expires_at INTEGER NOT NULL,
  CHECK (
    (status = 'waiting_guest' AND guest_name IS NULL AND guest_token_hash IS NULL
      AND host_lineup_code IS NULL AND guest_lineup_code IS NULL AND match_seed IS NULL)
    OR
    (status = 'selecting' AND guest_name IS NOT NULL AND guest_token_hash IS NOT NULL
      AND (host_lineup_code IS NULL OR guest_lineup_code IS NULL) AND match_seed IS NULL)
    OR
    (status = 'ready' AND host_lineup_code IS NOT NULL AND guest_lineup_code IS NOT NULL
      AND match_seed IS NULL)
    OR
    (status = 'complete' AND host_lineup_code IS NOT NULL AND guest_lineup_code IS NOT NULL
      AND match_seed IS NOT NULL AND started_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_battle_rooms_v2_expires_at
  ON battle_rooms_v2(expires_at);

CREATE TABLE IF NOT EXISTS battle_rooms_v3 (
  room_code TEXT PRIMARY KEY CHECK (
    length(room_code) = 8
    AND room_code NOT GLOB '*[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]*'
  ),
  status TEXT NOT NULL DEFAULT 'waiting_guest' CHECK (
    status IN ('waiting_guest', 'selecting', 'complete')
  ),
  room_type TEXT NOT NULL CHECK (room_type IN ('fair_pack', 'open_lineup')),
  card_pool_key TEXT NOT NULL DEFAULT 'all' CHECK (
    card_pool_key IN ('all', 'modern_2015_2026', 'historic_pre_2015')
  ),
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  host_score INTEGER NOT NULL DEFAULT 0 CHECK (host_score >= 0),
  guest_score INTEGER NOT NULL DEFAULT 0 CHECK (guest_score >= 0),
  scored_round INTEGER NOT NULL DEFAULT 0 CHECK (scored_round >= 0),
  round_winner TEXT CHECK (round_winner IS NULL OR round_winner IN ('host', 'guest')),
  host_name TEXT NOT NULL CHECK (length(host_name) BETWEEN 1 AND 12),
  host_token_hash TEXT NOT NULL CHECK (length(host_token_hash) = 64),
  host_lineup_code TEXT CHECK (
    host_lineup_code IS NULL
    OR (length(host_lineup_code) = 42 AND host_lineup_code GLOB 'NBA5-S1-*')
  ),
  host_ready_at INTEGER,
  host_pack_count INTEGER NOT NULL DEFAULT 0 CHECK (host_pack_count >= 0),
  host_rematch_mode TEXT CHECK (host_rematch_mode IS NULL OR host_rematch_mode IN ('same', 'redraft')),
  guest_name TEXT CHECK (guest_name IS NULL OR length(guest_name) BETWEEN 1 AND 12),
  guest_token_hash TEXT CHECK (guest_token_hash IS NULL OR length(guest_token_hash) = 64),
  guest_lineup_code TEXT CHECK (
    guest_lineup_code IS NULL
    OR (length(guest_lineup_code) = 42 AND guest_lineup_code GLOB 'NBA5-S1-*')
  ),
  guest_ready_at INTEGER,
  guest_pack_count INTEGER NOT NULL DEFAULT 0 CHECK (guest_pack_count >= 0),
  guest_rematch_mode TEXT CHECK (guest_rematch_mode IS NULL OR guest_rematch_mode IN ('same', 'redraft')),
  protocol_version TEXT NOT NULL CHECK (length(protocol_version) BETWEEN 1 AND 100),
  match_seed TEXT CHECK (match_seed IS NULL OR length(match_seed) BETWEEN 16 AND 100),
  created_at INTEGER NOT NULL,
  joined_at INTEGER,
  started_at INTEGER,
  expires_at INTEGER NOT NULL,
  CHECK (
    (status = 'waiting_guest' AND guest_name IS NULL AND guest_token_hash IS NULL
      AND guest_lineup_code IS NULL AND match_seed IS NULL)
    OR
    (status = 'selecting' AND guest_name IS NOT NULL AND guest_token_hash IS NOT NULL
      AND (host_lineup_code IS NULL OR guest_lineup_code IS NULL) AND match_seed IS NULL)
    OR
    (status = 'complete' AND host_lineup_code IS NOT NULL AND guest_lineup_code IS NOT NULL
      AND match_seed IS NOT NULL AND started_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_battle_rooms_v3_expires_at
  ON battle_rooms_v3(expires_at);

CREATE TABLE IF NOT EXISTS battle_room_rate_limits (
  client_hash TEXT NOT NULL CHECK (length(client_hash) = 64),
  action TEXT NOT NULL CHECK (action IN ('create', 'join')),
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (client_hash, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_battle_room_rate_limits_window
  ON battle_room_rate_limits(window_start);

CREATE TABLE IF NOT EXISTS product_analytics_events (
  event_id TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 12 AND 80),
  event_name TEXT NOT NULL CHECK (event_name IN (
    'session_start',
    'mode_entered',
    'pack_opened',
    'lineup_completed',
    'nba82_started',
    'nba82_completed',
    'nba5_started',
    'nba5_completed',
    'room_created',
    'room_joined',
    'room_started',
    'result_shared'
  )),
  visitor_hash TEXT NOT NULL CHECK (length(visitor_hash) = 64),
  session_hash TEXT NOT NULL CHECK (length(session_hash) = 64),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'candidate', 'local')),
  mode TEXT NOT NULL CHECK (mode IN ('home', 'nba82', 'nba5', 'online')),
  language TEXT NOT NULL CHECK (language IN ('zh', 'en')),
  device_class TEXT NOT NULL CHECK (device_class IN ('mobile', 'tablet', 'desktop')),
  entry_source TEXT NOT NULL CHECK (entry_source IN ('direct', 'internal', 'external')),
  release_version TEXT NOT NULL CHECK (length(release_version) BETWEEN 1 AND 100),
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_received
  ON product_analytics_events(received_at, environment, event_name);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_visitor
  ON product_analytics_events(visitor_hash, received_at);

CREATE INDEX IF NOT EXISTS idx_product_analytics_events_session
  ON product_analytics_events(session_hash, received_at);

CREATE TABLE IF NOT EXISTS product_analytics_rate_limits (
  client_hash TEXT NOT NULL CHECK (length(client_hash) = 64),
  window_start INTEGER NOT NULL,
  event_count INTEGER NOT NULL CHECK (event_count >= 1),
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (client_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_product_analytics_rate_limits_window
  ON product_analytics_rate_limits(window_start);

CREATE TABLE IF NOT EXISTS wechat_analytics_events (
  event_id TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 12 AND 80),
  event_name TEXT NOT NULL CHECK (event_name IN (
    'session_start', 'mode_entered', 'pack_opened', 'lineup_completed',
    'nba5_started', 'nba5_completed', 'room_created', 'room_joined',
    'room_started', 'home_shared', 'invite_shared', 'result_shared',
    'reward_ad_started', 'reward_ad_completed', 'bonus_pack_granted'
  )),
  visitor_hash TEXT NOT NULL CHECK (length(visitor_hash) = 64),
  session_hash TEXT NOT NULL CHECK (length(session_hash) = 64),
  mode TEXT NOT NULL CHECK (length(mode) BETWEEN 1 AND 32),
  simulation_type TEXT NOT NULL CHECK (simulation_type IN ('quick', 'coach', 'unknown')),
  pool_mode TEXT NOT NULL CHECK (pool_mode IN ('three_pack', 'full', 'unknown')),
  release_version TEXT NOT NULL CHECK (length(release_version) BETWEEN 1 AND 100),
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wechat_analytics_events_received
  ON wechat_analytics_events(received_at, event_name);

CREATE INDEX IF NOT EXISTS idx_wechat_analytics_events_visitor
  ON wechat_analytics_events(visitor_hash, received_at);

CREATE INDEX IF NOT EXISTS idx_wechat_analytics_events_mode
  ON wechat_analytics_events(mode, received_at);

CREATE TABLE IF NOT EXISTS wechat_official_daily (
  ref_date TEXT PRIMARY KEY CHECK (length(ref_date) = 10),
  session_count INTEGER NOT NULL DEFAULT 0,
  visit_pv INTEGER NOT NULL DEFAULT 0,
  visit_uv INTEGER NOT NULL DEFAULT 0,
  new_uv INTEGER NOT NULL DEFAULT 0,
  stay_time_uv REAL NOT NULL DEFAULT 0,
  stay_time_session REAL NOT NULL DEFAULT 0,
  visit_depth REAL NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL
);
