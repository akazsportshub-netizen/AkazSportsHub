import { Redis } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Connection for BullMQ queues and workers. BullMQ requires
 * `maxRetriesPerRequest: null` because its workers use blocking commands.
 */
export function createBullConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

/**
 * Connection for request-path commands (locks, health check). It fails fast when
 * Redis is down instead of queueing commands, so an HTTP request never hangs on Redis.
 */
export function createCommandConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
}
