import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { errorMessage } from '../common/api-error';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import {
  BookingJobData,
  JOB_CAPTURE,
  JOB_EXPIRE_HOLD,
  JOB_RECRUIT_RINGERS,
  JOB_RELEASE,
  JOB_SWEEP,
  QUEUE_HOLDS,
  QUEUE_PAYMENTS,
  QUEUE_RINGERS,
  RingerJobData,
  SWEEP_EVERY_MS,
} from './queue.constants';
import { createBullConnection } from './redis';

/** An enqueue must never hold an HTTP request hostage when Redis is slow or down. */
const ENQUEUE_TIMEOUT_MS = 2_000;

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 6,
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
};

/**
 * Producer side of the background queues. Every enqueue is best effort: it returns
 * false instead of throwing, because the once-a-minute sweep re-discovers any work
 * from the database (expired holds, payments awaiting capture or release).
 */
@Injectable()
export class QueuesService implements OnModuleDestroy {
  private readonly logger = new Logger(QueuesService.name);
  private readonly connection: Redis;
  private readonly holds: Queue;
  private readonly payments: Queue;
  private readonly ringers: Queue;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.connection = createBullConnection(config.redisUrl);
    this.connection.on('error', (error: Error) => this.logger.warn(`Queue Redis connection error: ${error.message}`));

    const options = { connection: this.connection, defaultJobOptions: DEFAULT_JOB_OPTIONS };
    this.holds = new Queue(QUEUE_HOLDS, options);
    this.payments = new Queue(QUEUE_PAYMENTS, options);
    this.ringers = new Queue(QUEUE_RINGERS, options);
    for (const queue of [this.holds, this.payments, this.ringers]) {
      queue.on('error', (error: Error) => this.logger.warn(`Queue ${queue.name} error: ${error.message}`));
    }
  }

  /** Fires just after the hold deadline and releases the court if it is still unpaid. */
  enqueueHoldExpiry(bookingId: string, holdExpiresAt: Date): Promise<boolean> {
    const delay = Math.max(0, holdExpiresAt.getTime() - Date.now()) + 1_000;
    const data: BookingJobData = { bookingId };
    return this.add(this.holds, JOB_EXPIRE_HOLD, data, { delay });
  }

  /** Captures the authorized (held) card payments of a booking that just became confirmed. */
  enqueueCapture(bookingId: string): Promise<boolean> {
    const data: BookingJobData = { bookingId };
    return this.add(this.payments, JOB_CAPTURE, data);
  }

  /** Voids or refunds every payment that should not be kept for this booking. */
  enqueueRelease(bookingId: string): Promise<boolean> {
    const data: BookingJobData = { bookingId };
    return this.add(this.payments, JOB_RELEASE, data);
  }

  enqueueRingerWave(requestId: string, wave: number, delayMs = 0): Promise<boolean> {
    const data: RingerJobData = { requestId, wave };
    return this.add(this.ringers, JOB_RECRUIT_RINGERS, data, { delay: delayMs, attempts: 3 });
  }

  /** Registers the repeating sweep. Safe to call on every boot: BullMQ keeps one schedule per key. */
  async ensureSweeper(): Promise<void> {
    await this.holds.add(JOB_SWEEP, {}, {
      repeat: { every: SWEEP_EVERY_MS },
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.holds.close(), this.payments.close(), this.ringers.close()]);
    this.connection.disconnect();
  }

  private async add(queue: Queue, name: string, data: object, options: JobsOptions = {}): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`enqueue timed out after ${ENQUEUE_TIMEOUT_MS} ms`)), ENQUEUE_TIMEOUT_MS);
      });
      await Promise.race([queue.add(name, data, options), timeout]);
      return true;
    } catch (error) {
      this.logger.error(`Could not enqueue ${queue.name}/${name} ${JSON.stringify(data)} — the sweep will pick it up: ${errorMessage(error)}`);
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
