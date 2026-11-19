-- =============================================================================
-- AKAZ Sports Hub — 001 initial schema
-- PostgreSQL 16 + PostGIS. Money is stored in minor units (halalas, dirhams,
-- fils, baisa) as BIGINT; see the currencies table for the number of decimals.
-- All timestamps are TIMESTAMPTZ because the platform spans UTC+3 and UTC+4.
-- =============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- lets a GiST index compare uuid with "="

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TABLE currencies (
  code      text PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  decimals  smallint NOT NULL CHECK (decimals BETWEEN 0 AND 3),
  name      text NOT NULL
);

INSERT INTO currencies (code, decimals, name) VALUES
  ('QAR', 2, 'Qatari riyal'),
  ('SAR', 2, 'Saudi riyal'),
  ('AED', 2, 'UAE dirham'),
  ('BHD', 3, 'Bahraini dinar'),
  ('OMR', 3, 'Omani rial');

-- -----------------------------------------------------------------------------
-- Identity
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name          text NOT NULL CHECK (length(btrim(full_name)) > 0),
  phone_e164         text UNIQUE CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email              text,
  country_code       text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  elo_rating         integer NOT NULL DEFAULT 1200 CHECK (elo_rating BETWEEN 0 AND 4000),
  reliability_score  numeric(5,2) NOT NULL DEFAULT 100 CHECK (reliability_score BETWEEN 0 AND 100),
  home_location      geography(Point, 4326),
  open_to_ringer     boolean NOT NULL DEFAULT false,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX users_home_location_gix ON users USING gist (home_location);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_roles (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('PLAYER','PARENT','VENUE_MANAGER','REFEREE','ADMIN')),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

-- Children managed by a parent account (academy players such as an U-10).
CREATE TABLE dependent_profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name         text NOT NULL CHECK (length(btrim(full_name)) > 0),
  date_of_birth     date,
  age_group         text,
  elo_rating        integer NOT NULL DEFAULT 1200 CHECK (elo_rating BETWEEN 0 AND 4000),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dependent_profiles_guardian_idx ON dependent_profiles (guardian_user_id);
CREATE TRIGGER dependent_profiles_set_updated_at BEFORE UPDATE ON dependent_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Venues & courts
-- -----------------------------------------------------------------------------
CREATE TABLE venues (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  description              text,
  country_code             text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  city                     text NOT NULL,
  address                  text,
  currency                 text NOT NULL REFERENCES currencies(code),
  timezone                 text NOT NULL,                       -- IANA name, e.g. Asia/Qatar
  location                 geography(Point, 4326) NOT NULL,
  manager_user_id          uuid REFERENCES users(id),
  requires_turf_footwear   boolean NOT NULL DEFAULT false,      -- TF-only footwear rule
  rules                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  commission_bps           integer NOT NULL DEFAULT 1000 CHECK (commission_bps BETWEEN 0 AND 10000),
  free_cancellation_hours  integer NOT NULL DEFAULT 24 CHECK (free_cancellation_hours >= 0),
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX venues_location_gix ON venues USING gist (location);
CREATE INDEX venues_manager_idx ON venues (manager_user_id);
CREATE TRIGGER venues_set_updated_at BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE courts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id              uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  sport                 text NOT NULL CHECK (sport IN ('FOOTBALL','PADEL','BADMINTON','BASKETBALL','VOLLEYBALL','TENNIS','CRICKET')),
  surface               text,
  capacity_players      integer NOT NULL CHECK (capacity_players BETWEEN 2 AND 30),
  price_per_hour_minor  bigint NOT NULL CHECK (price_per_hour_minor > 0),
  slot_minutes          integer NOT NULL DEFAULT 60 CHECK (slot_minutes IN (30, 60, 90, 120)),
  opens_at              time NOT NULL DEFAULT '06:00',
  closes_at             time NOT NULL DEFAULT '00:00',          -- closes_at <= opens_at means "past midnight"
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);
CREATE INDEX courts_venue_sport_idx ON courts (venue_id, sport);
CREATE TRIGGER courts_set_updated_at BEFORE UPDATE ON courts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Bookings & split-pay shares
-- -----------------------------------------------------------------------------
CREATE TABLE bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id            uuid NOT NULL REFERENCES courts(id),
  organizer_user_id   uuid NOT NULL REFERENCES users(id),
  slot_range          tstzrange NOT NULL,
  status              text NOT NULL DEFAULT 'HOLD'
                        CHECK (status IN ('HOLD','CONFIRMED','COMPLETED','EXPIRED','CANCELLED')),
  currency            text NOT NULL REFERENCES currencies(code),
  total_minor         bigint NOT NULL CHECK (total_minor > 0),
  platform_fee_minor  bigint NOT NULL CHECK (platform_fee_minor >= 0),
  hold_expires_at     timestamptz NOT NULL,
  confirmed_at        timestamptz,
  expired_at          timestamptz,
  cancelled_at        timestamptz,
  cancelled_by        uuid REFERENCES users(id),
  cancel_reason       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookings_fee_within_total CHECK (platform_fee_minor <= total_minor),
  CONSTRAINT bookings_slot_range_valid CHECK (
    NOT isempty(slot_range)
    AND lower_inc(slot_range) AND NOT upper_inc(slot_range)
    AND NOT lower_inf(slot_range) AND NOT upper_inf(slot_range)
  ),
  -- The double-booking guarantee: two live bookings on the same court can never
  -- overlap, whatever the application or a race condition tries to do.
  CONSTRAINT bookings_no_double_booking EXCLUDE USING gist (
    court_id WITH =,
    slot_range WITH &&
  ) WHERE (status IN ('HOLD','CONFIRMED','COMPLETED'))
);
CREATE INDEX bookings_organizer_idx ON bookings (organizer_user_id, created_at DESC);
CREATE INDEX bookings_hold_expiry_idx ON bookings (hold_expires_at) WHERE status = 'HOLD';
CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE booking_split_shares (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id),
  amount_minor     bigint NOT NULL CHECK (amount_minor > 0),
  currency         text NOT NULL REFERENCES currencies(code),
  status           text NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','PAID','REFUNDED','CANCELLED')),
  paid_attempt_id  uuid,                                          -- FK added below
  paid_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, user_id),
  CONSTRAINT shares_paid_attempt_matches_status
    CHECK ((status IN ('PAID','REFUNDED')) = (paid_attempt_id IS NOT NULL))
);
CREATE INDEX booking_split_shares_user_idx ON booking_split_shares (user_id, created_at DESC);
CREATE TRIGGER booking_split_shares_set_updated_at BEFORE UPDATE ON booking_split_shares
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One row per trip to a payment provider. A share can have several attempts
-- (retries, two browser tabs); at most one is the share's paid attempt and any
-- other successful attempt is voided or refunded automatically.
CREATE TABLE payment_attempts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id              uuid NOT NULL REFERENCES booking_split_shares(id) ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN ('tap','checkout','mock')),
  flow                  text NOT NULL CHECK (flow IN ('AUTHORIZE','CHARGE')),
  amount_minor          bigint NOT NULL CHECK (amount_minor > 0),
  currency              text NOT NULL REFERENCES currencies(code),
  status                text NOT NULL DEFAULT 'CREATED' CHECK (status IN (
                          'CREATED','AUTHORIZED','CAPTURE_PENDING','CAPTURED',
                          'VOID_PENDING','VOIDED','REFUND_PENDING','REFUNDED','FAILED')),
  provider_payment_id   text,      -- auth_… / chg_… (Tap), pay_… (Checkout.com)
  provider_capture_id   text,      -- Tap charge created when an authorization is captured
  provider_refund_id    text,
  provider_customer_id  text,
  checkout_url          text,
  failure_reason        text,
  needs_review          boolean NOT NULL DEFAULT false,
  authorized_at         timestamptz,
  captured_at           timestamptz,
  released_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_attempts_provider_payment_key
  ON payment_attempts (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX payment_attempts_share_idx ON payment_attempts (share_id, created_at DESC);
CREATE INDEX payment_attempts_open_idx ON payment_attempts (status)
  WHERE status IN ('AUTHORIZED','CAPTURE_PENDING','CAPTURED','VOID_PENDING','REFUND_PENDING');
CREATE TRIGGER payment_attempts_set_updated_at BEFORE UPDATE ON payment_attempts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE booking_split_shares
  ADD CONSTRAINT booking_split_shares_paid_attempt_fk
  FOREIGN KEY (paid_attempt_id) REFERENCES payment_attempts(id);

-- Every provider webhook is stored once; the unique key makes redelivery harmless.
CREATE TABLE payment_webhook_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider      text NOT NULL,
  event_key     text NOT NULL,
  event_type    text NOT NULL,
  attempt_id    uuid REFERENCES payment_attempts(id) ON DELETE SET NULL,
  outcome       text NOT NULL,
  payload       jsonb NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_key)
);

-- -----------------------------------------------------------------------------
-- Matches & referee events
-- -----------------------------------------------------------------------------
CREATE TABLE matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        uuid UNIQUE REFERENCES bookings(id) ON DELETE SET NULL,
  court_id          uuid NOT NULL REFERENCES courts(id),
  referee_user_id   uuid REFERENCES users(id),
  home_team_name    text NOT NULL,
  away_team_name    text NOT NULL,
  status            text NOT NULL DEFAULT 'SCHEDULED'
                      CHECK (status IN ('SCHEDULED','LIVE','FINISHED','ABANDONED')),
  scheduled_start   timestamptz NOT NULL,
  started_at        timestamptz,
  ended_at          timestamptz,
  home_score        integer NOT NULL DEFAULT 0 CHECK (home_score >= 0),
  away_score        integer NOT NULL DEFAULT 0 CHECK (away_score >= 0),
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX matches_referee_idx ON matches (referee_user_id, scheduled_start);
CREATE INDEX matches_court_idx ON matches (court_id, scheduled_start);
CREATE TRIGGER matches_set_updated_at BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The primary key is generated on the referee's device, so an offline batch can
-- be re-sent any number of times without creating duplicates.
CREATE TABLE match_events (
  id                    uuid PRIMARY KEY,
  match_id              uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  event_type            text NOT NULL CHECK (event_type IN (
                          'MATCH_START','MATCH_END','PERIOD_START','PERIOD_END',
                          'GOAL','OWN_GOAL','YELLOW_CARD','RED_CARD','WHITE_CARD','SUBSTITUTION')),
  team_side             text CHECK (team_side IN ('HOME','AWAY')),
  player_user_id        uuid REFERENCES users(id),
  player_name           text,
  shirt_number          integer CHECK (shirt_number BETWEEN 0 AND 99),
  match_clock_seconds   integer NOT NULL CHECK (match_clock_seconds >= 0),
  occurred_at           timestamptz NOT NULL,       -- device clock at the moment of the event
  sin_bin_release_at    timestamptz,                -- WHITE_CARD only: occurred_at + 2 minutes
  note                  text,
  recorded_by           uuid NOT NULL REFERENCES users(id),
  device_id             text,
  synced_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_events_sin_bin_only_for_white_card
    CHECK ((event_type = 'WHITE_CARD') = (sin_bin_release_at IS NOT NULL)),
  CONSTRAINT match_events_team_required
    CHECK (event_type IN ('MATCH_START','MATCH_END','PERIOD_START','PERIOD_END') OR team_side IS NOT NULL)
);
CREATE INDEX match_events_match_idx ON match_events (match_id, occurred_at);
CREATE INDEX match_events_sin_bin_idx ON match_events (match_id, sin_bin_release_at)
  WHERE event_type = 'WHITE_CARD';

-- -----------------------------------------------------------------------------
-- Ringer recruitment (substitute players for short-handed bookings)
-- -----------------------------------------------------------------------------
CREATE TABLE ringer_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  requested_by   uuid NOT NULL REFERENCES users(id),
  slots_needed   integer NOT NULL CHECK (slots_needed BETWEEN 1 AND 10),
  slots_filled   integer NOT NULL DEFAULT 0 CHECK (slots_filled >= 0),
  target_elo     integer NOT NULL,
  status         text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FILLED','EXPIRED','CANCELLED')),
  last_wave      integer NOT NULL DEFAULT -1,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ringer_requests_not_overfilled CHECK (slots_filled <= slots_needed)
);
CREATE UNIQUE INDEX ringer_requests_one_open_per_booking
  ON ringer_requests (booking_id) WHERE status = 'OPEN';
CREATE TRIGGER ringer_requests_set_updated_at BEFORE UPDATE ON ringer_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ringer_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES ringer_requests(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id),
  wave          integer NOT NULL,
  distance_m    integer,
  status        text NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT','ACCEPTED','DECLINED','EXPIRED')),
  responded_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, user_id)
);
CREATE INDEX ringer_invites_user_idx ON ringer_invites (user_id, status);

-- -----------------------------------------------------------------------------
-- Slot rules: opening hours and slot alignment, evaluated in the venue's time zone.
-- Returns NULL when the slot is bookable, otherwise a short reason code.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION court_slot_violation(p_court_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  c            record;
  local_start  timestamp;
  local_end    timestamp;
  open_ts      timestamp;
  close_ts     timestamp;
  session_len  interval;
  slot_seconds bigint;
BEGIN
  SELECT co.opens_at, co.closes_at, co.slot_minutes,
         co.is_active AS court_active, v.is_active AS venue_active, v.timezone
    INTO c
    FROM courts co JOIN venues v ON v.id = co.venue_id
   WHERE co.id = p_court_id;

  IF NOT FOUND THEN RETURN 'COURT_NOT_FOUND'; END IF;
  IF NOT (c.court_active AND c.venue_active) THEN RETURN 'COURT_INACTIVE'; END IF;
  IF p_end <= p_start THEN RETURN 'INVALID_RANGE'; END IF;

  local_start := p_start AT TIME ZONE c.timezone;
  local_end   := p_end   AT TIME ZONE c.timezone;

  session_len := c.closes_at - c.opens_at;
  IF session_len <= interval '0' THEN
    session_len := session_len + interval '24 hours';
  END IF;

  -- The session a slot belongs to may have opened the previous calendar day.
  open_ts := date_trunc('day', local_start) + c.opens_at;
  IF local_start < open_ts THEN
    open_ts := open_ts - interval '1 day';
  END IF;
  close_ts := open_ts + session_len;

  IF local_start < open_ts OR local_end > close_ts THEN
    RETURN 'OUTSIDE_OPENING_HOURS';
  END IF;

  slot_seconds := c.slot_minutes * 60;
  IF (extract(epoch FROM (local_start - open_ts))::bigint % slot_seconds) <> 0
     OR (extract(epoch FROM (p_end - p_start))::bigint % slot_seconds) <> 0 THEN
    RETURN 'MISALIGNED_SLOT';
  END IF;

  RETURN NULL;
END $$;

COMMIT;
