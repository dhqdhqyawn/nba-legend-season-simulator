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
