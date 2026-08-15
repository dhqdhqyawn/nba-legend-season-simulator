-- Local candidate migration for two-sided, hidden, per-game NBA5 strategy rooms.
-- Old battle-1.8 rooms continue to use battle_rooms_v3 without reading these tables.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS battle_room_series_v1 (
  room_code TEXT NOT NULL,
  round_number INTEGER NOT NULL CHECK (round_number >= 1),
  protocol_version TEXT NOT NULL CHECK (
    protocol_version = 'nba5-room-v4.strategy-series-0.1'
  ),
  status TEXT NOT NULL DEFAULT 'waiting_start' CHECK (
    status IN ('waiting_start', 'active', 'complete', 'cancelled')
  ),
  current_game_number INTEGER NOT NULL DEFAULT 0 CHECK (
    current_game_number BETWEEN 0 AND 7
  ),
  host_game_wins INTEGER NOT NULL DEFAULT 0 CHECK (host_game_wins BETWEEN 0 AND 4),
  guest_game_wins INTEGER NOT NULL DEFAULT 0 CHECK (guest_game_wins BETWEEN 0 AND 4),
  lineup_snapshot_hash TEXT CHECK (
    lineup_snapshot_hash IS NULL OR length(lineup_snapshot_hash) = 64
  ),
  settlement_version TEXT NOT NULL CHECK (length(settlement_version) BETWEEN 1 AND 160),
  host_start_ready_at INTEGER,
  guest_start_ready_at INTEGER,
  cancelled_by TEXT CHECK (cancelled_by IS NULL OR cancelled_by IN ('host', 'guest')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  cancelled_at INTEGER,
  PRIMARY KEY (room_code, round_number),
  FOREIGN KEY (room_code) REFERENCES battle_rooms_v3(room_code) ON DELETE CASCADE,
  CHECK (
    (status = 'waiting_start' AND current_game_number = 0 AND completed_at IS NULL
      AND cancelled_at IS NULL AND cancelled_by IS NULL)
    OR
    (status = 'active' AND current_game_number BETWEEN 1 AND 7 AND completed_at IS NULL
      AND cancelled_at IS NULL AND cancelled_by IS NULL
      AND host_game_wins < 4 AND guest_game_wins < 4)
    OR
    (status = 'complete' AND current_game_number BETWEEN 1 AND 7 AND completed_at IS NOT NULL
      AND cancelled_at IS NULL AND cancelled_by IS NULL
      AND ((host_game_wins = 4 AND guest_game_wins < 4)
        OR (guest_game_wins = 4 AND host_game_wins < 4)))
    OR
    (status = 'cancelled' AND completed_at IS NULL AND cancelled_at IS NOT NULL
      AND cancelled_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_battle_room_series_v1_status
  ON battle_room_series_v1(status, updated_at);

CREATE TABLE IF NOT EXISTS battle_room_series_games_v1 (
  room_code TEXT NOT NULL,
  round_number INTEGER NOT NULL CHECK (round_number >= 1),
  game_number INTEGER NOT NULL CHECK (game_number BETWEEN 1 AND 7),
  status TEXT NOT NULL DEFAULT 'strategy_open' CHECK (
    status IN (
      'strategy_open',
      'one_side_locked',
      'both_sides_locked',
      'settled_result_ready'
    )
  ),
  game_seed TEXT CHECK (game_seed IS NULL OR length(game_seed) = 64),
  host_lineup_json TEXT CHECK (host_lineup_json IS NULL OR json_valid(host_lineup_json)),
  guest_lineup_json TEXT CHECK (guest_lineup_json IS NULL OR json_valid(guest_lineup_json)),
  winner_role TEXT CHECK (winner_role IS NULL OR winner_role IN ('host', 'guest')),
  host_score INTEGER CHECK (host_score IS NULL OR host_score BETWEEN 0 AND 300),
  guest_score INTEGER CHECK (guest_score IS NULL OR guest_score BETWEEN 0 AND 300),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  result_hash TEXT CHECK (result_hash IS NULL OR length(result_hash) = 64),
  settlement_version TEXT NOT NULL CHECK (length(settlement_version) BETWEEN 1 AND 160),
  settled_at INTEGER,
  host_revealed_at INTEGER,
  guest_revealed_at INTEGER,
  host_next_ready_at INTEGER,
  guest_next_ready_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (room_code, round_number, game_number),
  FOREIGN KEY (room_code, round_number)
    REFERENCES battle_room_series_v1(room_code, round_number) ON DELETE CASCADE,
  CHECK (
    (status != 'settled_result_ready' AND result_json IS NULL AND result_hash IS NULL
      AND winner_role IS NULL AND host_score IS NULL AND guest_score IS NULL
      AND settled_at IS NULL)
    OR
    (status = 'settled_result_ready' AND result_json IS NOT NULL AND result_hash IS NOT NULL
      AND winner_role IS NOT NULL AND host_score IS NOT NULL AND guest_score IS NOT NULL
      AND host_score != guest_score AND game_seed IS NOT NULL AND settled_at IS NOT NULL
      AND host_lineup_json IS NOT NULL AND guest_lineup_json IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_battle_room_series_games_v1_status
  ON battle_room_series_games_v1(room_code, round_number, status, game_number);

CREATE TABLE IF NOT EXISTS battle_room_game_strategies_v1 (
  room_code TEXT NOT NULL,
  round_number INTEGER NOT NULL CHECK (round_number >= 1),
  game_number INTEGER NOT NULL CHECK (game_number BETWEEN 1 AND 7),
  role TEXT NOT NULL CHECK (role IN ('host', 'guest')),
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 12 AND 80),
  strategy_json TEXT NOT NULL CHECK (json_valid(strategy_json)),
  strategy_hash TEXT NOT NULL CHECK (length(strategy_hash) = 64),
  submission_source TEXT NOT NULL CHECK (submission_source IN ('manual', 'automatic')),
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY (room_code, round_number, game_number, role),
  UNIQUE (room_code, round_number, game_number, role, request_id),
  FOREIGN KEY (room_code, round_number, game_number)
    REFERENCES battle_room_series_games_v1(room_code, round_number, game_number) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_battle_room_game_strategies_v1_hash
  ON battle_room_game_strategies_v1(room_code, round_number, game_number, strategy_hash);
