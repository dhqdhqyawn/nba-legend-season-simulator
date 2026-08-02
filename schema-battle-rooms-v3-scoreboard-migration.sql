ALTER TABLE battle_rooms_v3
  ADD COLUMN host_score INTEGER NOT NULL DEFAULT 0 CHECK (host_score >= 0);

ALTER TABLE battle_rooms_v3
  ADD COLUMN guest_score INTEGER NOT NULL DEFAULT 0 CHECK (guest_score >= 0);

ALTER TABLE battle_rooms_v3
  ADD COLUMN scored_round INTEGER NOT NULL DEFAULT 0 CHECK (scored_round >= 0);

ALTER TABLE battle_rooms_v3
  ADD COLUMN round_winner TEXT CHECK (round_winner IS NULL OR round_winner IN ('host', 'guest'));
