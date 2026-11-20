import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { apiError } from '../common/api-error';
import { DatabaseService } from '../database/database.service';
import { coarsen } from './location';
import { RateLimiter } from './rate-limit';

export interface UserLookupResult {
  id: string;
  full_name: string;
}

@Injectable()
export class UsersService {
  /** 20 lookups a minute per caller, so the route cannot be used to scan phone numbers. */
  private readonly limiter = new RateLimiter(20, 60_000);

  constructor(private readonly db: DatabaseService) {}

  async setLocation(userId: string, lat: number, lng: number, openToRinger?: boolean) {
    const [row] = await this.db.query<{ open_to_ringer: boolean }>(
      /* sql */ `
      UPDATE users
         SET home_location = ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography,
             open_to_ringer = COALESCE($4::boolean, open_to_ringer)
       WHERE id = $1
      RETURNING open_to_ringer`,
      [userId, coarsen(lat), coarsen(lng), openToRinger ?? null],
    );
    return { lat: coarsen(lat), lng: coarsen(lng), open_to_ringer: row?.open_to_ringer ?? false };
  }

  async setLanguage(userId: string, locale: 'en' | 'ar'): Promise<{ locale: 'en' | 'ar' }> {
    await this.db.query(/* sql */ `UPDATE users SET locale = $2 WHERE id = $1`, [userId, locale]);
    return { locale };
  }

  async lookupByPhone(callerId: string, phone: string): Promise<UserLookupResult> {
    if (!this.limiter.allow(callerId)) {
      throw new HttpException(apiError('RATE_LIMITED', 'Too many lookups. Try again in a minute.'), HttpStatus.TOO_MANY_REQUESTS);
    }
    const [user] = await this.db.query<UserLookupResult>(
      `SELECT id, full_name FROM users WHERE phone_e164 = $1 AND is_active = true`,
      [phone],
    );
    // Same answer whether the number is unknown or the account is inactive.
    if (!user) throw new NotFoundException(apiError('USER_NOT_FOUND', 'No AKAZ player uses that number.'));
    return user;
  }
}
