import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { apiError } from '../common/api-error';
import { DatabaseService } from '../database/database.service';
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
