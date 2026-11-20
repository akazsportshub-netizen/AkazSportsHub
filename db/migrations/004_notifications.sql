-- Notifications: a transactional outbox. A message is written in the same transaction as the
-- booking or invitation that causes it, and a worker sends it afterwards.

ALTER TABLE users ADD COLUMN notify_opt_out boolean NOT NULL DEFAULT false;

CREATE TABLE notifications_outbox (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id),
  kind                text NOT NULL,
  channel             text NOT NULL DEFAULT 'WHATSAPP' CHECK (channel IN ('WHATSAPP', 'SMS')),
  to_phone            text NOT NULL,
  body                text NOT NULL,
  status              text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts            int NOT NULL DEFAULT 0,
  send_after          timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  last_error          text,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_outbox_due_idx ON notifications_outbox (send_after) WHERE status = 'PENDING';
CREATE INDEX notifications_outbox_user_idx ON notifications_outbox (user_id, created_at DESC);
CREATE TRIGGER notifications_outbox_set_updated_at BEFORE UPDATE ON notifications_outbox
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
