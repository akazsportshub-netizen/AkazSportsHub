-- Academy ERP: training groups run by a venue, enrolment, weekly sessions, attendance and monthly fees.
-- Dates here are venue-local calendar days (the venue's timezone decides what "today" is).

CREATE TABLE academy_groups (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id           uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name               text NOT NULL CHECK (length(btrim(name)) > 0),
  sport              text NOT NULL CHECK (sport IN ('FOOTBALL','PADEL','BADMINTON','BASKETBALL','VOLLEYBALL','TENNIS','CRICKET')),
  age_group          text,                                   -- free text such as 'U-10'
  coach_name         text,
  weekday            smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),   -- ISO: 1 = Monday ... 7 = Sunday
  starts_at          time NOT NULL,
  duration_minutes   integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 240),
  monthly_fee_minor  bigint NOT NULL CHECK (monthly_fee_minor >= 0),
  capacity           integer NOT NULL CHECK (capacity BETWEEN 1 AND 200),
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);
CREATE INDEX academy_groups_venue_idx ON academy_groups (venue_id);
CREATE TRIGGER academy_groups_set_updated_at BEFORE UPDATE ON academy_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One row per child (or adult) in a group. The account holder (user_id) is who is contacted and who pays.
CREATE TABLE academy_enrolments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES academy_groups(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id),
  dependent_id  uuid REFERENCES dependent_profiles(id),   -- null means the account holder trains themself
  status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED')),
  started_on    date NOT NULL,
  ended_on      date,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- A person can be in a group once at a time (dependent and user ids never collide, so coalesce is safe).
CREATE UNIQUE INDEX academy_enrolments_one_active
  ON academy_enrolments (group_id, coalesce(dependent_id, user_id)) WHERE status = 'ACTIVE';
CREATE INDEX academy_enrolments_user_idx ON academy_enrolments (user_id);

CREATE TABLE academy_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES academy_groups(id) ON DELETE CASCADE,
  session_date  date NOT NULL,
  cancelled     boolean NOT NULL DEFAULT false,
  note          text,
  UNIQUE (group_id, session_date)
);

CREATE TABLE academy_attendance (
  session_id    uuid NOT NULL REFERENCES academy_sessions(id) ON DELETE CASCADE,
  enrolment_id  uuid NOT NULL REFERENCES academy_enrolments(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('PRESENT','ABSENT','EXCUSED')),
  marked_by     uuid REFERENCES users(id),
  marked_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, enrolment_id)
);

-- Monthly fee. Paying is recorded by the venue for now (cash, bank transfer); online payment comes later.
CREATE TABLE academy_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrolment_id  uuid NOT NULL REFERENCES academy_enrolments(id) ON DELETE CASCADE,
  period        date NOT NULL CHECK (extract(day FROM period) = 1),   -- first day of the month
  amount_minor  bigint NOT NULL CHECK (amount_minor >= 0),
  currency      text NOT NULL REFERENCES currencies(code),
  status        text NOT NULL DEFAULT 'DUE' CHECK (status IN ('DUE','PAID','WAIVED')),
  paid_at       timestamptz,
  pay_method    text CHECK (pay_method IN ('CASH','BANK','OTHER')),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrolment_id, period)
);
CREATE INDEX academy_invoices_status_idx ON academy_invoices (status, period);
