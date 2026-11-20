import { Queryable } from '../database/database.service';
import { Locale, MessageKind, MessageVars, renderMessage } from './templates';

export interface OutboundMessage {
  userId: string;
  phone: string;
  kind: MessageKind;
  vars: MessageVars;
  /** The recipient's language; English if left out. */
  locale?: Locale;
}

/**
 * Writes messages to the outbox using the caller's transaction, so a message exists only if
 * the booking or invitation that caused it was committed. A worker sends them afterwards.
 */
export async function queueMessages(q: Queryable, messages: readonly OutboundMessage[]): Promise<void> {
  if (messages.length === 0) return;
  await q.query(
    /* sql */ `
    INSERT INTO notifications_outbox (user_id, to_phone, kind, body)
    SELECT t.user_id, t.phone, t.kind, t.body
      FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[]) AS t(user_id, phone, kind, body)`,
    [
      messages.map((m) => m.userId),
      messages.map((m) => m.phone),
      messages.map((m) => m.kind),
      messages.map((m) => renderMessage(m.kind, m.vars, m.locale ?? 'en')),
    ],
  );
}
