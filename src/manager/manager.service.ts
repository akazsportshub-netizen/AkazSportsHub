import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { apiError } from '../common/api-error';
import { DatabaseService, PG_EXCLUSION_VIOLATION, PG_UNIQUE_VIOLATION, pgErrorCode, Queryable } from '../database/database.service';
import { CreateBlockDto, CreateCourtDto, EarningsQueryDto, ManagerBookingsQueryDto, UpdateCourtDto } from './dto/manager.dto';
import { BLOCK_MESSAGES, blockProblem, sumEarnings, touchesSchedule } from './manager';

/** A booking that still occupies its slot. */
const LIVE_BOOKING = /* sql */ `(b.status IN ('CONFIRMED','COMPLETED') OR (b.status = 'HOLD' AND b.hold_expires_at > now()))`;

const COURT_COLUMNS = ['name', 'surface', 'capacity_players', 'price_per_hour_minor', 'slot_minutes', 'opens_at', 'closes_at', 'is_active'] as const;

@Injectable()
export class ManagerService {
  constructor(private readonly db: DatabaseService) {}

  /** A manager only ever reaches their own venues; anyone else's looks like it does not exist. */
  private async ownVenue(q: Queryable, venueId: string, user: AuthUser) {
    const [venue] = await q.query<{ id: string; timezone: string; currency: string }>(
      /* sql */ `SELECT id, timezone, currency FROM venues WHERE id = $1 AND manager_user_id = $2`,
      [venueId, user.id],
    );
    if (!venue) throw new NotFoundException(apiError('VENUE_NOT_FOUND', 'Venue not found'));
    return venue;
  }

  private async ownCourt(q: Queryable, courtId: string, user: AuthUser) {
    const [court] = await q.query<{ id: string; venue_id: string }>(
      /* sql */ `
      SELECT c.id, c.venue_id FROM courts c JOIN venues v ON v.id = c.venue_id
       WHERE c.id = $1 AND v.manager_user_id = $2`,
      [courtId, user.id],
    );
    if (!court) throw new NotFoundException(apiError('COURT_NOT_FOUND', 'Court not found'));
    return court;
  }

  myVenues(user: AuthUser) {
    return this.db.query(
      /* sql */ `
      SELECT v.id, v.name, v.city, v.currency, v.timezone, v.commission_bps, v.is_active,
             (SELECT count(*)::int FROM courts c WHERE c.venue_id = v.id AND c.is_active) AS active_courts
        FROM venues v WHERE v.manager_user_id = $1 ORDER BY v.name`,
      [user.id],
    );
  }

  // ---- bookings ----------------------------------------------------------------

  async bookings(venueId: string, query: ManagerBookingsQueryDto, user: AuthUser) {
    const venue = await this.ownVenue(this.db, venueId, user);
    return this.db.query(
      /* sql */ `
      WITH win AS (
        SELECT (coalesce($2::date, (now() AT TIME ZONE $4)::date))::timestamp AT TIME ZONE $4 AS from_ts,
               ((coalesce($3::date, coalesce($2::date, (now() AT TIME ZONE $4)::date) + 14)) + 1)::timestamp AT TIME ZONE $4 AS to_ts
      )
      SELECT b.id, b.court_id, c.name AS court_name, c.sport,
             lower(b.slot_range) AS starts_at, upper(b.slot_range) AS ends_at,
             b.status, b.total_minor, b.currency, b.cancel_reason,
             u.full_name AS organizer_name, coalesce(u.phone_e164, u.email) AS organizer_phone,
             (SELECT count(*)::int FROM booking_split_shares s WHERE s.booking_id = b.id AND s.status <> 'CANCELLED') AS shares_total,
             (SELECT count(*)::int FROM booking_split_shares s WHERE s.booking_id = b.id AND s.status = 'PAID') AS shares_paid
        FROM bookings b
        JOIN courts c ON c.id = b.court_id
        JOIN users u ON u.id = b.organizer_user_id, win
       WHERE c.venue_id = $1
         AND b.slot_range && tstzrange(win.from_ts, win.to_ts, '[)')
         AND ($5::text IS NULL OR b.status = $5::text)
       ORDER BY lower(b.slot_range), c.name
       LIMIT $6::int`,
      [venueId, query.from ?? null, query.to ?? null, venue.timezone, query.status ?? null, query.limit ?? 200],
    );
  }

  // ---- courts ------------------------------------------------------------------

  async courts(venueId: string, user: AuthUser) {
    await this.ownVenue(this.db, venueId, user);
    return this.db.query(
      /* sql */ `
      SELECT c.id, c.name, c.sport, c.surface, c.capacity_players, c.price_per_hour_minor, c.slot_minutes,
             to_char(c.opens_at, 'HH24:MI') AS opens_at, to_char(c.closes_at, 'HH24:MI') AS closes_at, c.is_active
        FROM courts c WHERE c.venue_id = $1 ORDER BY c.is_active DESC, c.sport, c.name`,
      [venueId],
    );
  }

  async createCourt(venueId: string, dto: CreateCourtDto, user: AuthUser) {
    await this.ownVenue(this.db, venueId, user);
    try {
      const [court] = await this.db.query<{ id: string }>(
        /* sql */ `
        INSERT INTO courts (venue_id, name, sport, surface, capacity_players, price_per_hour_minor, slot_minutes, opens_at, closes_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::time, $9::time)
        RETURNING id`,
        [venueId, dto.name.trim(), dto.sport, dto.surface?.trim() || null, dto.capacity_players, dto.price_per_hour_minor, dto.slot_minutes, dto.opens_at, dto.closes_at],
      );
      return { id: court.id };
    } catch (error) {
      throw this.nameTaken(error);
    }
  }

  /** Price, name and capacity change at any time (existing bookings keep the price they were made at). */
  async updateCourt(courtId: string, dto: UpdateCourtDto, user: AuthUser) {
    return this.db.tx(async (q) => {
      await this.ownCourt(q, courtId, user);
      const patch = dto as Record<string, unknown>;
      const columns = COURT_COLUMNS.filter((column) => patch[column] !== undefined);
      if (columns.length === 0) throw new UnprocessableEntityException(apiError('NOTHING_TO_CHANGE', 'Nothing to change.'));

      if (touchesSchedule(patch)) {
        const [{ upcoming }] = await q.query<{ upcoming: number }>(
          /* sql */ `
          SELECT count(*)::int AS upcoming FROM bookings b
           WHERE b.court_id = $1 AND upper(b.slot_range) > now() AND ${LIVE_BOOKING}`,
          [courtId],
        );
        if (upcoming > 0) {
          throw new ConflictException(
            apiError('COURT_HAS_BOOKINGS', 'This court has upcoming bookings. Cancel them first, or change only the price, name or capacity.'),
          );
        }
      }

      const sets = columns.map((column, index) => `${column} = $${index + 2}${column === 'opens_at' || column === 'closes_at' ? '::time' : ''}`);
      try {
        await q.query(/* sql */ `UPDATE courts SET ${sets.join(', ')} WHERE id = $1`, [courtId, ...columns.map((column) => patch[column])]);
      } catch (error) {
        throw this.nameTaken(error);
      }
      return { ok: true };
    });
  }

  private nameTaken(error: unknown): unknown {
    return pgErrorCode(error) === PG_UNIQUE_VIOLATION
      ? new ConflictException(apiError('COURT_NAME_TAKEN', 'This venue already has a court with that name.'))
      : error;
  }

  // ---- blocks ------------------------------------------------------------------

  async blocks(venueId: string, user: AuthUser) {
    await this.ownVenue(this.db, venueId, user);
    return this.db.query(
      /* sql */ `
      SELECT k.id, k.court_id, c.name AS court_name, lower(k.slot_range) AS starts_at, upper(k.slot_range) AS ends_at, k.reason
        FROM court_blocks k JOIN courts c ON c.id = k.court_id
       WHERE c.venue_id = $1 AND upper(k.slot_range) > now()
       ORDER BY lower(k.slot_range), c.name`,
      [venueId],
    );
  }

  async createBlock(courtId: string, dto: CreateBlockDto, user: AuthUser) {
    const startsAt = new Date(dto.starts_at);
    const endsAt = new Date(dto.ends_at);
    const problem = blockProblem(startsAt, endsAt, new Date());
    if (problem) throw new UnprocessableEntityException(apiError('INVALID_BLOCK', BLOCK_MESSAGES[problem]));
    await this.ownCourt(this.db, courtId, user);
    try {
      const [block] = await this.db.query<{ id: string }>(
        /* sql */ `
        INSERT INTO court_blocks (court_id, slot_range, reason, created_by)
        VALUES ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), $4, $5)
        RETURNING id`,
        [courtId, startsAt, endsAt, dto.reason?.trim() || null, user.id],
      );
      return { id: block.id };
    } catch (error) {
      if (pgErrorCode(error) === PG_EXCLUSION_VIOLATION) {
        throw new ConflictException(
          apiError('BLOCK_CONFLICT', 'That time overlaps a booking or another block. Cancel the booking first, or pick a different time.'),
        );
      }
      throw error;
    }
  }

  async deleteBlock(blockId: string, user: AuthUser) {
    const removed = await this.db.query<{ id: string }>(
      /* sql */ `
      DELETE FROM court_blocks k USING courts c, venues v
       WHERE k.id = $1 AND c.id = k.court_id AND v.id = c.venue_id AND v.manager_user_id = $2
       RETURNING k.id`,
      [blockId, user.id],
    );
    if (removed.length === 0) throw new NotFoundException(apiError('BLOCK_NOT_FOUND', 'Block not found'));
    return { ok: true };
  }

  // ---- earnings ----------------------------------------------------------------

  /**
   * Confirmed and completed bookings by the day they are played (venue-local time).
   * Cancelled and expired bookings were refunded, so they are not counted.
   * This is what the venue earns; paying it out to the venue is not tracked yet.
   */
  async earnings(venueId: string, query: EarningsQueryDto, user: AuthUser) {
    const venue = await this.ownVenue(this.db, venueId, user);
    const [range] = await this.db.query<{ from_day: string; to_day: string }>(
      /* sql */ `
      SELECT to_char(coalesce($1::date, date_trunc('month', now() AT TIME ZONE $3)::date), 'YYYY-MM-DD') AS from_day,
             to_char(coalesce($2::date, (now() AT TIME ZONE $3)::date), 'YYYY-MM-DD') AS to_day`,
      [query.from ?? null, query.to ?? null, venue.timezone],
    );
    const days = await this.db.query<{ day: string; bookings: number; gross_minor: number; commission_minor: number }>(
      /* sql */ `
      SELECT to_char((lower(b.slot_range) AT TIME ZONE $4)::date, 'YYYY-MM-DD') AS day,
             count(*)::int AS bookings,
             sum(b.total_minor)::bigint AS gross_minor,
             sum(b.platform_fee_minor)::bigint AS commission_minor
        FROM bookings b JOIN courts c ON c.id = b.court_id
       WHERE c.venue_id = $1
         AND b.status IN ('CONFIRMED','COMPLETED')
         AND (lower(b.slot_range) AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
       GROUP BY 1 ORDER BY 1`,
      [venueId, range.from_day, range.to_day, venue.timezone],
    );
    return {
      currency: venue.currency,
      from: range.from_day,
      to: range.to_day,
      ...sumEarnings(days),
      days: days.map((day) => ({ ...day, net_minor: day.gross_minor - day.commission_minor })),
    };
  }
}
