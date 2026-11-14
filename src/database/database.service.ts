import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, types } from 'pg';
import { APP_CONFIG, AppConfig } from '../config/app-config';

// BIGINT (oid 20) arrives as a string by default. Every bigint in this schema is
// a money amount in minor units or a row count, far below 2^53, so a JS number is safe.
types.setTypeParser(20, (value: string) => Number(value));

/** Anything that can run SQL: the pool itself, or a client inside a transaction. */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]>;
}

/** Postgres error codes the services react to. */
export const PG_EXCLUSION_VIOLATION = '23P01';
export const PG_UNIQUE_VIOLATION = '23505';

export function pgErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

@Injectable()
export class DatabaseService implements Queryable, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    // An idle client can error (server restart); without a listener that would crash the process.
    this.pool.on('error', (error: Error) => this.logger.error(`Idle Postgres client error: ${error.message}`));
  }

  async query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]> {
    const result = await this.pool.query(text, params ? [...params] : undefined);
    return result.rows as T[];
  }

  /** Runs `work` in a transaction: commit on return, rollback on throw. */
  async tx<T>(work: (q: Queryable) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    const q: Queryable = {
      query: async <R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]> => {
        const result = await client.query(text, params ? [...params] : undefined);
        return result.rows as R[];
      },
    };
    try {
      await client.query('BEGIN');
      const value = await work(q);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        this.logger.error(`Rollback failed: ${(rollbackError as Error).message}`);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
