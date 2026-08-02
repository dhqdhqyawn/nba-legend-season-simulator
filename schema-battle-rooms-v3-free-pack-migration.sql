-- One-time D1 migration for NBA5 online-room protocol battle-1.7.
-- Fair-pack rooms remain capped at three by the API; open-lineup rooms may
-- persist any non-negative number of pack opens.

ALTER TABLE battle_rooms_v3 RENAME TO battle_rooms_v3_pack_limited;

CREATE TABLE battle_rooms_v3 (
  room_code TEXT PRIMARY KEY CHECK (
    length(room_code) = 8
    AND room_code NOT GLOB '*[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]*'
  ),
  status TEXT NOT NULL DEFAULT 'waiting_guest' CHECK (
    status IN ('waiting_guest', 'selecting', 'complete')
  ),
  room_type TEXT NOT NULL CHECK (room_type IN ('fair_pack', 'open_lineup')),
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 1),
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

INSERT INTO battle_rooms_v3 (
  room_code,
  status,
  room_type,
  round_number,
  host_name,
  host_token_hash,
  host_lineup_code,
  host_ready_at,
  host_pack_count,
  host_rematch_mode,
  guest_name,
  guest_token_hash,
  guest_lineup_code,
  guest_ready_at,
  guest_pack_count,
  guest_rematch_mode,
  protocol_version,
  match_seed,
  created_at,
  joined_at,
  started_at,
  expires_at
)
SELECT
  room_code,
  status,
  room_type,
  round_number,
  host_name,
  host_token_hash,
  host_lineup_code,
  host_ready_at,
  host_pack_count,
  host_rematch_mode,
  guest_name,
  guest_token_hash,
  guest_lineup_code,
  guest_ready_at,
  guest_pack_count,
  guest_rematch_mode,
  protocol_version,
  match_seed,
  created_at,
  joined_at,
  started_at,
  expires_at
FROM battle_rooms_v3_pack_limited;

DROP TABLE battle_rooms_v3_pack_limited;

CREATE INDEX IF NOT EXISTS idx_battle_rooms_v3_expires_at
  ON battle_rooms_v3(expires_at);
