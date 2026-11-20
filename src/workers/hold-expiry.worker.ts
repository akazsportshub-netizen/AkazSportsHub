import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BookingsService } from '../bookings/bookings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { BookingJobData, JOB_EXPIRE_HOLD, JOB_SWEEP } from '../queues/queue.constants';

/**
 * TTL expiration worker for the 15-minute split-pay hold.
 *
 * `expire-hold` is a delayed job scheduled when the hold is created; it fires just after
 * the deadline, releases the court if the booking is still unpaid and queues the
 * void/refund of any share that was already paid.
 *
 * `sweep` repeats every minute and finds the same work straight from the database, so a
 * lost job, a Redis restart or a deploy at the wrong second cannot leave a court blocked
 * or a customer's money held.
 */
@Injectable()
export class HoldExpiryWorker {
  private readonly logger = new Logger(HoldExpiryWorker.name);

  constructor(
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_EXPIRE_HOLD: {
        const { bookingId } = job.data as BookingJobData;
        await this.bookings.expireHold(bookingId);
        return;
      }
      case JOB_SWEEP: {
        const holds = await this.bookings.sweep();
        const payments = await this.payments.sweep();
        const ringers = await this.payments.sweepRingers();
        const messages = await this.notifications.dispatchDue();
        const busy =
          holds.expired + holds.completed + payments.captures + payments.releases + payments.flagged + ringers.expiredShares + ringers.settled + messages.sent + messages.failed > 0;
        if (busy) this.logger.log(`Sweep: ${JSON.stringify({ ...holds, ...payments, ...ringers, messages })}`);
        return;
      }
      default:
        this.logger.warn(`Unknown job "${job.name}" on the holds queue`);
    }
  }
}
