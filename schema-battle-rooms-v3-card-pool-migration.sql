ALTER TABLE battle_rooms_v3
ADD COLUMN card_pool_key TEXT NOT NULL DEFAULT 'all'
CHECK (card_pool_key IN ('all', 'modern_2015_2026', 'historic_pre_2015'));
