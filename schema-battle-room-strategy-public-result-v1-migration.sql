-- Additive hotfix for online coach v4 rooms created by the original 2.7.0
-- migration. Apply once before deploying Functions that read this column.
-- Existing 2.7.0 rows need a compact compatibility source before the new
-- Functions are activated. This SQL projection is not the API allowlist: every
-- read is still passed through projectStrategyRoomPublicResult() before it can
-- enter a response. Removing the four private top-level runtime fields reduces
-- old ~1.2 MB rows to a few KB without ever selecting raw history at request
-- time.

ALTER TABLE battle_room_series_games_v1
  ADD COLUMN public_result_json TEXT
  CHECK (public_result_json IS NULL OR json_valid(public_result_json));

UPDATE battle_room_series_games_v1
SET public_result_json = json_remove(
  result_json,
  '$.game.matchupModel',
  '$.game.baseProbabilityTeamA',
  '$.game.probabilityTeamA',
  '$.game.strategyDeltaLimit'
)
WHERE result_json IS NOT NULL AND public_result_json IS NULL;
