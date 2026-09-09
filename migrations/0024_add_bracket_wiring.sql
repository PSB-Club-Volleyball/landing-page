-- Explicit match wiring for knockout brackets. Single elimination advanced
-- positionally (round r slot s feeds round r+1 slot floor(s/2)); double
-- elimination drops losers into the losers bracket at irregular positions, so
-- every bracket match now records where its winner and loser go instead.
--
-- A target is a (bracket, round, slot) coordinate on this same event plus the
-- side to fill (0 = team_a_id, 1 = team_b_id). NULL columns mean "nowhere" —
-- the match is a bracket leaf (a final, or a losers-bracket loser who is out).
-- `bracket` gains 'losers' and 'final' alongside the existing 'pool'/'winners'.
ALTER TABLE event_matches ADD COLUMN winner_to_bracket TEXT;
ALTER TABLE event_matches ADD COLUMN winner_to_round INTEGER;
ALTER TABLE event_matches ADD COLUMN winner_to_slot INTEGER;
ALTER TABLE event_matches ADD COLUMN winner_to_side INTEGER;
ALTER TABLE event_matches ADD COLUMN loser_to_bracket TEXT;
ALTER TABLE event_matches ADD COLUMN loser_to_round INTEGER;
ALTER TABLE event_matches ADD COLUMN loser_to_slot INTEGER;
ALTER TABLE event_matches ADD COLUMN loser_to_side INTEGER;
