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
