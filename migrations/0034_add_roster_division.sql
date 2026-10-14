-- Which side of the club a roster player plays on, so the public Roster page
-- can list the men's and women's teams separately. NULL until an admin sets
-- it (every row before this migration, and every auto-added account row).
ALTER TABLE roster ADD COLUMN division TEXT CHECK (division IN ('men', 'women'));
