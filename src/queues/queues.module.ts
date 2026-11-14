import { Global, Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { LockService } from './lock.service';
import { QueuesService } from './queues.service';
import { createCommandConnection, REDIS_CLIENT } from './redis';

/** Redis connection, distributed locks and BullMQ producers, shared by every module. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Redis => {
        const logger = new Logger('Redis');
        const client = createCommandConnection(config.redisUrl);
        client.on('error', (error: Error) => logger.warn(`Redis connection error: ${error.message}`));
        return client;
      },
    },
    LockService,
    QueuesService,
  ],
  exports: [REDIS_CLIENT, LockService, QueuesService],
})
export class QueuesModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
