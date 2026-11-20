-- Times a venue takes a court out of sale (maintenance, private events, tournaments).
CREATE TABLE court_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id    uuid NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  slot_range  tstzrange NOT NULL,
  reason      text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT court_blocks_range_valid CHECK (
    NOT isempty(slot_range) AND lower_inc(slot_range) AND NOT upper_inc(slot_range)
    AND NOT lower_inf(slot_range) AND NOT upper_inf(slot_range)
  ),
  CONSTRAINT court_blocks_no_overlap EXCLUDE USING gist (court_id WITH =, slot_range WITH &&)
);
CREATE INDEX court_blocks_court_idx ON court_blocks (court_id, upper(slot_range));

-- A block and a live booking can never overlap, whichever is created second.
-- Both triggers take the same per-court lock so two requests at once cannot both slip through.
-- They raise 23P01 (exclusion_violation), which the booking code already reports as SLOT_TAKEN.
CREATE FUNCTION bookings_respect_blocks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('HOLD', 'CONFIRMED', 'COMPLETED') THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.court_id::text));
    IF EXISTS (SELECT 1 FROM court_blocks b WHERE b.court_id = NEW.court_id AND b.slot_range && NEW.slot_range) THEN
      RAISE EXCEPTION 'court is blocked for this time' USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bookings_respect_blocks_trg
  BEFORE INSERT OR UPDATE OF slot_range, status, court_id ON bookings
  FOR EACH ROW EXECUTE FUNCTION bookings_respect_blocks();

CREATE FUNCTION blocks_respect_bookings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.court_id::text));
  IF EXISTS (
    SELECT 1 FROM bookings k
     WHERE k.court_id = NEW.court_id
       AND k.slot_range && NEW.slot_range
       AND (k.status IN ('CONFIRMED', 'COMPLETED') OR (k.status = 'HOLD' AND k.hold_expires_at > now()))
  ) THEN
    RAISE EXCEPTION 'court has a booking in this time' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER blocks_respect_bookings_trg
  BEFORE INSERT OR UPDATE OF slot_range, court_id ON court_blocks
  FOR EACH ROW EXECUTE FUNCTION blocks_respect_bookings();
