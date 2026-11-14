import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PaymentsService } from '../payments/payments.service';
import { BookingJobData, JOB_CAPTURE, JOB_RELEASE } from '../queues/queue.constants';

/**
 * Talks to the payment providers outside the request path.
 *
 * `capture` takes the money held on cards once a booking is confirmed.
 * `release` voids holds and refunds charges for bookings that expired or were cancelled,
 *           and for any share that was paid more than once.
 *
 * Both are idempotent and throw on a provider error, so BullMQ retries them with backoff.
 */
@Injectable()
export class PaymentSettlementWorker {
  private readonly logger = new Logger(PaymentSettlementWorker.name);

  constructor(private readonly payments: PaymentsService) {}

  async process(job: Job): Promise<void> {
    const { bookingId } = job.data as BookingJobData;
    switch (job.name) {
      case JOB_CAPTURE:
        await this.payments.captureBooking(bookingId);
        return;
      case JOB_RELEASE:
        await this.payments.releaseBooking(bookingId);
        return;
      default:
        this.logger.warn(`Unknown job "${job.name}" on the payments queue`);
    }
  }
}
