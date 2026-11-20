import { Inject, Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '../common/api-error';
import { DatabaseService } from '../database/database.service';
import { MESSENGER, Messenger } from './messenger';

const MAX_ATTEMPTS = 5;
const BATCH = 50;

interface DueRow {
  id: string;
  to_phone: string;
  body: string;
  channel: 'WHATSAPP' | 'SMS';
  attempts: number;
  opted_out: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(MESSENGER) private readonly messenger: Messenger,
  ) {}

  /**
   * Sends the messages that are due. Rows are locked while they are sent, so two workers never
   * send the same message. A failure retries after 1, 2, 4 and 8 minutes, then gives up.
   */
  async dispatchDue(): Promise<{ sent: number; failed: number; skipped: number }> {
    const result = { sent: 0, failed: 0, skipped: 0 };
    await this.db.tx(async (q) => {
      const due = await q.query<DueRow>(
        /* sql */ `
        SELECT o.id, o.to_phone, o.body, o.channel, o.attempts, u.notify_opt_out AS opted_out
          FROM notifications_outbox o
          JOIN users u ON u.id = o.user_id
         WHERE o.status = 'PENDING' AND o.send_after <= now()
         ORDER BY o.created_at
         LIMIT ${BATCH}
           FOR UPDATE OF o SKIP LOCKED`,
      );
      for (const row of due) {
        if (row.opted_out) {
          await q.query(/* sql */ `UPDATE notifications_outbox SET status = 'SKIPPED' WHERE id = $1`, [row.id]);
          result.skipped += 1;
          continue;
        }
        try {
          const { providerMessageId } = await this.messenger.send(row.to_phone, row.body, row.channel);
          await q.query(
            /* sql */ `
            UPDATE notifications_outbox
               SET status = 'SENT', sent_at = now(), attempts = attempts + 1, provider_message_id = $2, last_error = NULL
             WHERE id = $1`,
            [row.id, providerMessageId],
          );
          result.sent += 1;
        } catch (error) {
          const attempts = row.attempts + 1;
          await q.query(
            /* sql */ `
            UPDATE notifications_outbox
               SET attempts = $2, last_error = $3,
                   status = CASE WHEN $2 >= ${MAX_ATTEMPTS} THEN 'FAILED' ELSE 'PENDING' END,
                   send_after = now() + make_interval(mins => power(2, $2 - 1)::int)
             WHERE id = $1`,
            [row.id, attempts, errorMessage(error).slice(0, 500)],
          );
          result.failed += 1;
          this.logger.warn(`Message ${row.id} failed (attempt ${attempts}): ${errorMessage(error)}`);
        }
      }
    });
    return result;
  }
}
