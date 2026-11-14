import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { errorMessage } from '../common/api-error';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { QUEUE_HOLDS, QUEUE_PAYMENTS, QUEUE_RINGERS } from '../queues/queue.constants';
import { QueuesService } from '../queues/queues.service';
import { createBullConnection } from '../queues/redis';
import { HoldExpiryWorker } from './hold-expiry.worker';
import { PaymentSettlementWorker } from './payment-settlement.worker';
import { RingerRecruitmentWorker } from './ringer-recruitment.worker';

/**
 * Starts the BullMQ consumers inside this process. With RUN_WORKERS=false the process
 * serves HTTP only, which lets the API and the workers be scaled separately from the
 * same image.
 */
@Injectable()
export class WorkersService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkersService.name);
  private readonly workers: Worker[] = [];
  private readonly connections: Redis[] = [];

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly queues: QueuesService,
    private readonly holdExpiry: HoldExpiryWorker,
    private readonly settlement: PaymentSettlementWorker,
    private readonly ringers: RingerRecruitmentWorker,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.runWorkers) {
      this.logger.log('RUN_WORKERS=false — background workers are not started in this process');
      return;
    }

    this.start(QUEUE_HOLDS, (job) => this.holdExpiry.process(job), 5);
    // Low concurrency on purpose: these jobs call payment providers, and work on one booking
    // is serialised by a lock inside PaymentsService anyway.
    this.start(QUEUE_PAYMENTS, (job) => this.settlement.process(job), 2);
    this.start(QUEUE_RINGERS, (job) => this.ringers.process(job), 2);

    try {
      await this.queues.ensureSweeper();
    } catch (error) {
      this.logger.error(`Could not register the sweep schedule: ${errorMessage(error)}`);
    }
    this.logger.log('Background workers started');
  }

  async onApplicationShutdown(): Promise<void> {
    // close() waits for jobs in progress, so a deploy never cuts a provider call in half.
    await Promise.allSettled(this.workers.map((worker) => worker.close()));
    for (const connection of this.connections) connection.disconnect();
  }

  private start(queueName: string, processor: (job: Job) => Promise<void>, concurrency: number): void {
    const connection = createBullConnection(this.config.redisUrl);
    connection.on('error', (error: Error) => this.logger.warn(`Worker Redis connection error (${queueName}): ${error.message}`));
    this.connections.push(connection);

    const worker = new Worker(queueName, processor, { connection, concurrency });
    worker.on('failed', (job: Job | undefined, error: Error) => {
      const attempts = job ? `attempt ${job.attemptsMade}/${job.opts.attempts ?? 1}` : 'unknown attempt';
      this.logger.error(`Job ${queueName}/${job?.name ?? '?'} ${JSON.stringify(job?.data ?? {})} failed (${attempts}): ${error.message}`);
    });
    worker.on('error', (error: Error) => this.logger.warn(`Worker ${queueName} error: ${error.message}`));
    this.workers.push(worker);
  }
}
