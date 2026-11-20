-- Phone sign-in codes. Only a keyed hash of each code is stored, never the code itself.
CREATE TABLE otp_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164   text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     int NOT NULL DEFAULT 0,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone_idx ON otp_codes (phone_e164, created_at DESC);
