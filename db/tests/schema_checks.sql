-- =============================================================================
-- Schema guarantees, checked against a migrated + seeded database.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/schema_checks.sql
-- Everything runs in one transaction that is rolled back, so no data is left behind.
-- A failed check raises an exception and stops the script.
-- =============================================================================
BEGIN;

DO $$
DECLARE
  v_court  uuid := '00000000-0000-4000-d000-000000000001';   -- Al Sadd pitch 1, 16:00–01:00 Asia/Qatar, 60-minute slots
  v_user   uuid := '00000000-0000-4000-a000-000000000010';
  v_first  uuid;
  v_reason text;
  v_caught boolean;
BEGIN
  -- 1. A hold takes the slot.
  INSERT INTO bookings (court_id, organizer_user_id, slot_range, status, currency, total_minor, platform_fee_minor, hold_expires_at)
  VALUES (v_court, v_user, tstzrange('2030-01-10 18:00+03', '2030-01-10 19:00+03', '[)'), 'HOLD', 'QAR', 25000, 2500, now() + interval '15 minutes')
  RETURNING id INTO v_first;

  -- 2. An overlapping booking on the same court must be rejected by the database.
  v_caught := false;
  BEGIN
    INSERT INTO bookings (court_id, organizer_user_id, slot_range, status, currency, total_minor, platform_fee_minor, hold_expires_at)
    VALUES (v_court, v_user, tstzrange('2030-01-10 18:30+03', '2030-01-10 19:30+03', '[)'), 'HOLD', 'QAR', 25000, 2500, now() + interval '15 minutes');
  EXCEPTION WHEN exclusion_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'CHECK FAILED: overlapping booking was accepted'; END IF;

  -- 3. The slot directly after it is free (ranges are half-open).
  INSERT INTO bookings (court_id, organizer_user_id, slot_range, status, currency, total_minor, platform_fee_minor, hold_expires_at)
  VALUES (v_court, v_user, tstzrange('2030-01-10 19:00+03', '2030-01-10 20:00+03', '[)'), 'HOLD', 'QAR', 25000, 2500, now() + interval '15 minutes');

  -- 4. The same time on another court is free.
  INSERT INTO bookings (court_id, organizer_user_id, slot_range, status, currency, total_minor, platform_fee_minor, hold_expires_at)
  VALUES ('00000000-0000-4000-d000-000000000002', v_user, tstzrange('2030-01-10 18:00+03', '2030-01-10 19:00+03', '[)'), 'HOLD', 'QAR', 35000, 3500, now() + interval '15 minutes');

  -- 5. Once a hold expires, the slot can be booked again.
  UPDATE bookings SET status = 'EXPIRED', expired_at = now() WHERE id = v_first;
  INSERT INTO bookings (court_id, organizer_user_id, slot_range, status, currency, total_minor, platform_fee_minor, hold_expires_at)
  VALUES (v_court, v_user, tstzrange('2030-01-10 18:00+03', '2030-01-10 19:00+03', '[)'), 'CONFIRMED', 'QAR', 25000, 2500, now());

  -- 6. An expired booking cannot be revived on top of the new one.
  v_caught := false;
  BEGIN
    UPDATE bookings SET status = 'CONFIRMED' WHERE id = v_first;
  EXCEPTION WHEN exclusion_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'CHECK FAILED: expired booking was revived over a live one'; END IF;

  -- 7. Opening hours and slot alignment, in the venue's own time zone.
  v_reason := court_slot_violation(v_court, '2030-01-10 18:00+03', '2030-01-10 19:00+03');
  IF v_reason IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: valid evening slot rejected (%)', v_reason; END IF;

  v_reason := court_slot_violation(v_court, '2030-01-11 00:00+03', '2030-01-11 01:00+03');
  IF v_reason IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: valid past-midnight slot rejected (%)', v_reason; END IF;

  v_reason := court_slot_violation(v_court, '2030-01-10 15:00+00', '2030-01-10 16:00+00');   -- 18:00 Doha, given in UTC
  IF v_reason IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: slot given in UTC rejected (%)', v_reason; END IF;

  v_reason := court_slot_violation(v_court, '2030-01-10 10:00+03', '2030-01-10 11:00+03');
  IF v_reason IS DISTINCT FROM 'OUTSIDE_OPENING_HOURS' THEN RAISE EXCEPTION 'CHECK FAILED: morning slot not rejected (%)', v_reason; END IF;

  v_reason := court_slot_violation(v_court, '2030-01-11 00:00+03', '2030-01-11 02:00+03');
  IF v_reason IS DISTINCT FROM 'OUTSIDE_OPENING_HOURS' THEN RAISE EXCEPTION 'CHECK FAILED: slot running past closing not rejected (%)', v_reason; END IF;

  v_reason := court_slot_violation(v_court, '2030-01-10 18:30+03', '2030-01-10 19:30+03');
  IF v_reason IS DISTINCT FROM 'MISALIGNED_SLOT' THEN RAISE EXCEPTION 'CHECK FAILED: half-hour offset not rejected (%)', v_reason; END IF;

  v_reason := court_slot_violation(v_court, '2030-01-10 18:00+03', '2030-01-10 18:45+03');
  IF v_reason IS DISTINCT FROM 'MISALIGNED_SLOT' THEN RAISE EXCEPTION 'CHECK FAILED: 45-minute booking not rejected (%)', v_reason; END IF;

  v_reason := court_slot_violation(gen_random_uuid(), '2030-01-10 18:00+03', '2030-01-10 19:00+03');
  IF v_reason IS DISTINCT FROM 'COURT_NOT_FOUND' THEN RAISE EXCEPTION 'CHECK FAILED: unknown court not reported (%)', v_reason; END IF;

  -- 90-minute padel court, 06:00–00:00.
  v_reason := court_slot_violation('00000000-0000-4000-d000-000000000004', '2030-01-10 07:30+03', '2030-01-10 09:00+03');
  IF v_reason IS NOT NULL THEN RAISE EXCEPTION 'CHECK FAILED: valid 90-minute padel slot rejected (%)', v_reason; END IF;

  v_reason := court_slot_violation('00000000-0000-4000-d000-000000000004', '2030-01-10 07:00+03', '2030-01-10 08:30+03');
  IF v_reason IS DISTINCT FROM 'MISALIGNED_SLOT' THEN RAISE EXCEPTION 'CHECK FAILED: off-grid padel slot not rejected (%)', v_reason; END IF;

  RAISE NOTICE 'booking and slot checks passed';
END $$;

DO $$
DECLARE
  v_match   uuid;
  v_ref     uuid := '00000000-0000-4000-a000-000000000005';
  v_caught  boolean;
BEGIN
  INSERT INTO matches (court_id, referee_user_id, home_team_name, away_team_name, scheduled_start)
  VALUES ('00000000-0000-4000-d000-000000000001', v_ref, 'Home', 'Away', '2030-01-10 18:00+03')
  RETURNING id INTO v_match;

  -- A white card must carry a sin-bin release time…
  v_caught := false;
  BEGIN
    INSERT INTO match_events (id, match_id, event_type, team_side, match_clock_seconds, occurred_at, recorded_by)
    VALUES (gen_random_uuid(), v_match, 'WHITE_CARD', 'HOME', 300, '2030-01-10 18:05+03', v_ref);
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'CHECK FAILED: white card without sin-bin release accepted'; END IF;

  -- …and no other event may carry one.
  v_caught := false;
  BEGIN
    INSERT INTO match_events (id, match_id, event_type, team_side, match_clock_seconds, occurred_at, sin_bin_release_at, recorded_by)
    VALUES (gen_random_uuid(), v_match, 'YELLOW_CARD', 'HOME', 300, '2030-01-10 18:05+03', '2030-01-10 18:07+03', v_ref);
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'CHECK FAILED: yellow card with sin-bin release accepted'; END IF;

  INSERT INTO match_events (id, match_id, event_type, team_side, match_clock_seconds, occurred_at, sin_bin_release_at, recorded_by)
  VALUES ('11111111-1111-4111-8111-111111111111', v_match, 'WHITE_CARD', 'HOME', 300, '2030-01-10 18:05+03', '2030-01-10 18:07+03', v_ref);

  -- Re-sending the same device event is a no-op.
  INSERT INTO match_events (id, match_id, event_type, team_side, match_clock_seconds, occurred_at, sin_bin_release_at, recorded_by)
  VALUES ('11111111-1111-4111-8111-111111111111', v_match, 'WHITE_CARD', 'HOME', 300, '2030-01-10 18:05+03', '2030-01-10 18:07+03', v_ref)
  ON CONFLICT (id) DO NOTHING;
  IF (SELECT count(*) FROM match_events WHERE match_id = v_match) <> 1 THEN
    RAISE EXCEPTION 'CHECK FAILED: duplicate device event was stored twice';
  END IF;

  RAISE NOTICE 'match event checks passed';
END $$;

ROLLBACK;
