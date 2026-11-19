import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { errorMessage } from '../common/api-error';
import { REDIS_CLIENT } from './redis';

/** Thrown by `withLock` when another holder kept the lock for the whole wait window. */
export class LockBusyError extends Error {
  constructor(public readonly key: string) {
    super(`Lock "${key}" is held by another process`);
    this.name = 'LockBusyError';
  }
}

export interface LockOptions {
  /** How long the lock lives if the holder dies without releasing it. */
  ttlMs: number;
  /** How long to keep trying before giving up. 0 = try once. */
  waitMs?: number;
  retryEveryMs?: number;
}

// Delete the key only if it still holds our token, so a lock that already expired
// and was taken by someone else is never released by the previous holder.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Distributed mutex following the Redlock algorithm for a single Redis node:
 * `SET key <random token> NX PX <ttl>` to acquire, compare-and-delete to release.
 *
 * The lock is a traffic controller, not the source of truth. Correctness is enforced
 * in PostgreSQL (the booking exclusion constraint and row locks), so if Redis is
 * unreachable the protected work still runs and the database remains the final guard.
 * Move to multi-node Redlock only if Redis itself becomes highly available.
 */
@Injectable()
export class LockService {
  private readonly logger = new Logger(LockService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async withLock<T>(key: string, options: LockOptions, work: () => Promise<T>): Promise<T> {
    const redisKey = `akaz:lock:${key}`;
    const token = randomUUID();
    const deadline = Date.now() + (options.waitMs ?? 0);
    const retryEveryMs = options.retryEveryMs ?? 100;

    let acquired = false;
    let redisAvailable = true;
    for (;;) {
      try {
        acquired = (await this.redis.set(redisKey, token, 'PX', options.ttlMs, 'NX')) === 'OK';
      } catch (error) {
        redisAvailable = false;
        this.logger.warn(`Redis unavailable for lock "${key}", continuing on database guarantees: ${errorMessage(error)}`);
      }
      if (acquired || !redisAvailable || Date.now() >= deadline) break;
      await sleep(retryEveryMs);
    }

    if (redisAvailable && !acquired) throw new LockBusyError(key);

    try {
      return await work();
    } finally {
      if (acquired) {
        try {
          await this.redis.eval(RELEASE_SCRIPT, 1, redisKey, token);
        } catch (error) {
          // The TTL will clear it.
          this.logger.warn(`Could not release lock "${key}": ${errorMessage(error)}`);
        }
      }
    }
  }
}
