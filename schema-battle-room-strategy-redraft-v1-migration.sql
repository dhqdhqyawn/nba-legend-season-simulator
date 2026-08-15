-- Additive migration for online coach v4 per-player redraft and optional
-- host-selected card pools. Apply once before deploying Functions that read
-- either new column.
--
-- The room column stores only the pending host proposal. The series column is
-- the immutable per-round rule snapshot, so changing the room's current pool
-- for round N+1 never rewrites round N history.

ALTER TABLE battle_rooms_v3
  ADD COLUMN rematch_card_pool_key TEXT
  CHECK (
    rematch_card_pool_key IS NULL
    OR rematch_card_pool_key IN ('all', 'modern_2015_2026', 'historic_pre_2015')
  );

ALTER TABLE battle_rooms_v3
  ADD COLUMN host_pack_request_id TEXT
  CHECK (host_pack_request_id IS NULL OR length(host_pack_request_id) BETWEEN 12 AND 80);

ALTER TABLE battle_rooms_v3
  ADD COLUMN guest_pack_request_id TEXT
  CHECK (guest_pack_request_id IS NULL OR length(guest_pack_request_id) BETWEEN 12 AND 80);

ALTER TABLE battle_room_series_v1
  ADD COLUMN card_pool_key TEXT
  CHECK (
    card_pool_key IS NULL
    OR card_pool_key IN ('all', 'modern_2015_2026', 'historic_pre_2015')
  );

-- No v4 release before this migration allowed a room to change pools between
-- rounds, so the room's current pool is the correct backfill for every
-- existing series row.
UPDATE battle_room_series_v1
SET card_pool_key = COALESCE(
  (
    SELECT room.card_pool_key
    FROM battle_rooms_v3 AS room
    WHERE room.room_code = battle_room_series_v1.room_code
  ),
  'all'
)
WHERE card_pool_key IS NULL;

CREATE TRIGGER IF NOT EXISTS battle_room_series_v1_card_pool_immutable
BEFORE UPDATE OF card_pool_key ON battle_room_series_v1
WHEN OLD.card_pool_key IS NOT NEW.card_pool_key
BEGIN
  SELECT RAISE(ABORT, 'battle_room_series_v1.card_pool_key is immutable');
END;
