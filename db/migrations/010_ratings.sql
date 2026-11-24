-- Verified skill ratings: who played on which side of a match, and how each rating moved.
ALTER TABLE users ADD COLUMN rated_matches integer NOT NULL DEFAULT 0 CHECK (rated_matches >= 0);
ALTER TABLE matches ADD COLUMN rated_at timestamptz;   -- set once, when the result has been applied to the ratings

CREATE TABLE match_players (
  match_id       uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id),
  side           text NOT NULL CHECK (side IN ('HOME','AWAY')),
  rating_before  integer,
  rating_after   integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX match_players_user_idx ON match_players (user_id);
