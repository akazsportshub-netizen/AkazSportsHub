-- Ringer payments: a ringer who accepts a place gets a payment share of their own, and the
-- players who already paid get the difference back as partial refunds.

ALTER TABLE booking_split_shares
  ADD COLUMN is_ringer boolean NOT NULL DEFAULT false,
  ADD COLUMN pay_by    timestamptz;          -- ringer shares only: pay before this or lose the place

-- One row per partial refund we owe or have sent. A full refund of a booking subtracts these.
CREATE TABLE share_refunds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id          uuid NOT NULL REFERENCES booking_split_shares(id) ON DELETE CASCADE,
  attempt_id        uuid NOT NULL REFERENCES payment_attempts(id),
  amount_minor      bigint NOT NULL CHECK (amount_minor > 0),
  currency          text NOT NULL REFERENCES currencies(code),
  reason            text NOT NULL,
  status            text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','REFUNDED','FAILED')),
  provider_refund_id text,
  failure_reason    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX share_refunds_attempt_idx ON share_refunds (attempt_id);
CREATE INDEX share_refunds_open_idx ON share_refunds (status) WHERE status = 'PENDING';
CREATE TRIGGER share_refunds_set_updated_at BEFORE UPDATE ON share_refunds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
