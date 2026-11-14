import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Public } from './auth/decorators';
import { DatabaseService } from './database/database.service';
import { REDIS_CLIENT } from './queues/redis';

/** Used by Docker, NGINX and uptime monitors. */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.db.query('SELECT 1').then(() => true, () => false),
      this.redis.ping().then(() => true, () => false),
    ]);
    const body = { status: database && redis ? 'ok' : 'degraded', database, redis };
    // Without Postgres nothing works; without Redis bookings still work on database guarantees.
    if (!database) throw new ServiceUnavailableException(body);
    return body;
  }
}
