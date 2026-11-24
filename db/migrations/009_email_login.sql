-- Sign-in codes sent by email. Only a keyed hash of each code is stored, never the code itself.
CREATE TABLE email_login_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     int NOT NULL DEFAULT 0,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_login_codes_email_idx ON email_login_codes (email, created_at DESC);
