import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuthUser, hasRole } from '../auth/auth.types';
import { bookingContext, phonesOf } from '../notifications/context';
import { queueMessages } from '../notifications/outbox';
import { apiError } from '../common/api-error';
import { platformFeeMinor, slotPriceMinor } from '../common/money';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DatabaseService, PG_EXCLUSION_VIOLATION, pgErrorCode, Queryable } from '../database/database.service';
import { LockBusyError, LockService } from '../queues/lock.service';
import { QueuesService } from '../queues/queues.service';
import { CreateBookingDto } from './dto/booking.dto';
import { allocateShares, ShareAllocation, ShareInput, SplitError } from './split';

/** Longest single booking. */
const MAX_BOOKING_MINUTES = 240;

const SLOT_VIOLATION_MESSAGES: Record<string, string> = {
  COURT_NOT_FOUND: 'Court not found',
  COURT_INACTIVE: 'This court is not open for booking',
  INVALID_RANGE: 'The end time must be after the start time',
  OUTSIDE_OPENING_HOURS: 'The requested time is outside the court’s opening hours',
  MISALIGNED_SLOT: 'The requested time does not line up with the court’s booking slots',
};

interface BookingRow {
  id: string;
  status: string;
  currency: string;
  total_minor: number;
  platform_fee_minor: number;
  starts_at: Date;
  ends_at: Date;
  hold_expires_at: Date;
  confirmed_at: Date | null;
  cancelled_at: Date | null;
  organizer_user_id: string;
  court_id: string;
  court_name: string;
  sport: string;
  venue_id: string;
  venue_name: string;
  timezone: string;
  requires_turf_footwear: boolean;
  free_cancellation_hours: number;
  manager_user_id: string | null;
}

interface ShareRow {
  id: string;
  user_id: string;
  full_name: string;
  amount_minor: number;
  currency: string;
  status: string;
  paid_at: Date | null;
  is_ringer: boolean;
  pay_by: Date | null;
  escrow_status: string | null;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    private readonly locks: LockService,
    private readonly queues: QueuesService,
  ) {}

  /**
   * Places a soft hold on a court slot and creates one payment share per payer.
   * The slot stays reserved for HOLD_MINUTES (15 by default); the booking is confirmed
   * when every share is paid and released automatically if it is not.
   *
   * Two layers stop double-booking: a short Redis lock per court keeps simultaneous
   * requests in a queue, and the database exclusion constraint is the hard guarantee.
   */
  async createHold(user: AuthUser, dto: CreateBookingDto) {
    const startsAt = new Date(dto.starts_at);
    const endsAt = new Date(dto.ends_at);
    const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;

    if (!(minutes > 0)) throw new BadRequestException(apiError('INVALID_RANGE', SLOT_VIOLATION_MESSAGES.INVALID_RANGE));
    if (!Number.isInteger(minutes)) throw new BadRequestException(apiError('INVALID_RANGE', 'Times must fall on whole minutes'));
    if (minutes > MAX_BOOKING_MINUTES) {
      throw new BadRequestException(apiError('BOOKING_TOO_LONG', `A booking can be at most ${MAX_BOOKING_MINUTES / 60} hours`));
    }
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException(apiError('SLOT_IN_PAST', 'The requested time has already started'));
    }

    const shareInputs: ShareInput[] =
      dto.shares && dto.shares.length > 0
        ? dto.shares.map((share) => ({ userId: share.user_id, amountMinor: share.amount_minor }))
        : [{ userId: user.id }];

    let created: { id: string; holdExpiresAt: Date; staleHoldIds: string[] };
    try {
      created = await this.locks.withLock(`court:${dto.court_id}`, { ttlMs: 10_000, waitMs: 3_000 }, () =>
        this.insertHold(user, dto.court_id, startsAt, endsAt, minutes, shareInputs),
      );
    } catch (error) {
      if (error instanceof LockBusyError) {
        throw new ConflictException(apiError('COURT_BUSY', 'This court is being booked right now. Please try again in a moment.'));
      }
      throw error;
    }

    await this.queues.enqueueHoldExpiry(created.id, created.holdExpiresAt);
    for (const staleId of created.staleHoldIds) await this.queues.enqueueRelease(staleId);

    return this.getBooking(user, created.id);
  }

  private insertHold(
    user: AuthUser,
    courtId: string,
    startsAt: Date,
    endsAt: Date,
    minutes: number,
    shareInputs: ShareInput[],
  ): Promise<{ id: string; holdExpiresAt: Date; staleHoldIds: string[] }> {
    return this.db.tx(async (q) => {
      // Clear holds on this court whose deadline passed but which the worker has not swept yet,
      // so a slot is never blocked a second longer than the hold window.
      const stale = await q.query<{ id: string }>(
        /* sql */ `
        UPDATE bookings
           SET status = 'EXPIRED', expired_at = now()
         WHERE court_id = $1 AND status = 'HOLD' AND hold_expires_at <= now()
        RETURNING id`,
        [courtId],
      );
      const staleHoldIds = stale.map((row) => row.id);
      if (staleHoldIds.length > 0) {
        await q.query(
          /* sql */ `
          UPDATE booking_split_shares
             SET status = 'CANCELLED'
           WHERE booking_id = ANY($1::uuid[]) AND status = 'PENDING'`,
          [staleHoldIds],
        );
      }

      const [court] = await q.query<{
        price_per_hour_minor: number;
        capacity_players: number;
        currency: string;
        commission_bps: number;
        violation: string | null;
      }>(
        /* sql */ `
        SELECT c.price_per_hour_minor, c.capacity_players, v.currency, v.commission_bps,
               court_slot_violation(c.id, $2::timestamptz, $3::timestamptz) AS violation
          FROM courts c JOIN venues v ON v.id = c.venue_id
         WHERE c.id = $1`,
        [courtId, startsAt, endsAt],
      );
      if (!court) throw new NotFoundException(apiError('COURT_NOT_FOUND', SLOT_VIOLATION_MESSAGES.COURT_NOT_FOUND));
      if (court.violation) {
        throw new UnprocessableEntityException(
          apiError(court.violation, SLOT_VIOLATION_MESSAGES[court.violation] ?? 'This time cannot be booked'),
        );
      }
      if (shareInputs.length > court.capacity_players) {
        throw new UnprocessableEntityException(
          apiError('TOO_MANY_PAYERS', `This court takes at most ${court.capacity_players} players`),
        );
      }

      const totalMinor = slotPriceMinor(court.price_per_hour_minor, minutes);
      const feeMinor = platformFeeMinor(totalMinor, court.commission_bps);

      let allocations: ShareAllocation[];
      try {
        allocations = allocateShares(totalMinor, shareInputs);
      } catch (error) {
        if (error instanceof SplitError) throw new UnprocessableEntityException(apiError(error.code, error.message));
        throw error;
      }

      const payerIds = allocations.map((share) => share.userId);
      const [{ known }] = await q.query<{ known: number }>(
        /* sql */ `SELECT count(*)::int AS known FROM users WHERE id = ANY($1::uuid[]) AND is_active`,
        [payerIds],
      );
      if (known !== payerIds.length) {
        throw new UnprocessableEntityException(apiError('UNKNOWN_PAYER', 'One or more payers do not have an active account'));
      }

      let booking: { id: string; hold_expires_at: Date };
      try {
        [booking] = await q.query<{ id: string; hold_expires_at: Date }>(
          /* sql */ `
          INSERT INTO bookings
            (court_id, organizer_user_id, slot_range, status, currency, total_minor, platform_fee_minor, hold_expires_at)
          VALUES
            ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)'), 'HOLD', $5, $6, $7,
             now() + make_interval(mins => $8::int))
          RETURNING id, hold_expires_at`,
          [courtId, user.id, startsAt, endsAt, court.currency, totalMinor, feeMinor, this.config.holdMinutes],
        );
      } catch (error) {
        if (pgErrorCode(error) === PG_EXCLUSION_VIOLATION) {
          throw new ConflictException(apiError('SLOT_TAKEN', 'This slot has just been taken. Please pick another time.'));
        }
        throw error;
      }

      await q.query(
        /* sql */ `
        INSERT INTO booking_split_shares (booking_id, user_id, amount_minor, currency)
        SELECT $1, t.user_id, t.amount_minor, $4
          FROM unnest($2::uuid[], $3::bigint[]) AS t(user_id, amount_minor)`,
        [booking.id, payerIds, allocations.map((share) => share.amountMinor), court.currency],
      );

      // Tell each friend who was added, in the same transaction as the booking.
      const friends = await phonesOf(q, [user.id, ...payerIds]);
      const context = await bookingContext(q, booking.id);
      if (context) {
        await queueMessages(
          q,
          payerIds.flatMap((payerId, index) => {
            const friend = friends.get(payerId);
            if (payerId === user.id || !friend) return [];
            return [
              {
                userId: payerId,
                phone: friend.phone,
                kind: 'SHARE_INVITE' as const,
                vars: {
                  who: friends.get(user.id)?.name,
                  court: context.court,
                  venue: context.venue,
                  when: context.when,
                  amountMinor: allocations[index].amountMinor,
                  currency: context.currency,
                  holdMinutes: this.config.holdMinutes,
                },
              },
            ];
          }),
        );
      }

      return { id: booking.id, holdExpiresAt: booking.hold_expires_at, staleHoldIds };
    });
  }

  /** Full booking with its shares. Visible to the organizer, the payers, the venue's manager and admins. */
  async getBooking(user: AuthUser, bookingId: string) {
    const [booking] = await this.db.query<BookingRow>(
      /* sql */ `
      SELECT b.id, b.status, b.currency, b.total_minor, b.platform_fee_minor,
             lower(b.slot_range) AS starts_at, upper(b.slot_range) AS ends_at,
             b.hold_expires_at, b.confirmed_at, b.cancelled_at, b.organizer_user_id,
             c.id AS court_id, c.name AS court_name, c.sport,
             v.id AS venue_id, v.name AS venue_name, v.timezone, v.requires_turf_footwear,
             v.free_cancellation_hours, v.manager_user_id
        FROM bookings b
        JOIN courts c ON c.id = b.court_id
        JOIN venues v ON v.id = c.venue_id
       WHERE b.id = $1`,
      [bookingId],
    );
    if (!booking) throw new NotFoundException(apiError('BOOKING_NOT_FOUND', 'Booking not found'));

    const shares = await this.db.query<ShareRow>(
      /* sql */ `
      SELECT s.id, s.user_id, u.full_name, s.amount_minor, s.currency, s.status, s.paid_at,
             s.is_ringer, s.pay_by, a.status AS escrow_status
        FROM booking_split_shares s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN payment_attempts a ON a.id = s.paid_attempt_id
       WHERE s.booking_id = $1
       ORDER BY s.created_at, s.id`,
      [bookingId],
    );

    const allowed =
      booking.organizer_user_id === user.id ||
      shares.some((share) => share.user_id === user.id) ||
      hasRole(user, 'ADMIN') ||
      (hasRole(user, 'VENUE_MANAGER') && booking.manager_user_id === user.id);
    // 404 rather than 403, so booking ids cannot be probed.
    if (!allowed) throw new NotFoundException(apiError('BOOKING_NOT_FOUND', 'Booking not found'));

    const { manager_user_id: _managerUserId, ...publicBooking } = booking;
    return { ...publicBooking, shares };
  }

  /** Bookings the caller organized or has a share in, most recent slot first. */
  listMine(user: AuthUser) {
    return this.db.query(
      /* sql */ `
      SELECT b.id, b.status, b.currency, b.total_minor,
             lower(b.slot_range) AS starts_at, upper(b.slot_range) AS ends_at, b.hold_expires_at,
             c.name AS court_name, v.name AS venue_name, v.timezone,
             (b.organizer_user_id = $1) AS is_organizer,
             mine.id AS my_share_id, mine.amount_minor AS my_share_minor, mine.status AS my_share_status
        FROM bookings b
        JOIN courts c ON c.id = b.court_id
        JOIN venues v ON v.id = c.venue_id
        LEFT JOIN booking_split_shares mine ON mine.booking_id = b.id AND mine.user_id = $1
       WHERE b.organizer_user_id = $1 OR mine.id IS NOT NULL
       ORDER BY lower(b.slot_range) DESC
       LIMIT 50`,
      [user.id],
    );
  }

  /**
   * Cancels a booking and gives every payer their money back.
   * The organizer can cancel a hold at any time and a confirmed booking until the venue's
   * free-cancellation cut-off; the venue's manager and admins can cancel at any time.
   */
  async cancel(user: AuthUser, bookingId: string, reason: string | undefined) {
    await this.db.tx(async (q) => {
      const [booking] = await q.query<{
        status: string;
        organizer_user_id: string;
        manager_user_id: string | null;
        free_cancellation_hours: number;
        within_free_window: boolean;
      }>(
        /* sql */ `
        SELECT b.status, b.organizer_user_id, v.manager_user_id, v.free_cancellation_hours,
               (now() <= lower(b.slot_range) - make_interval(hours => v.free_cancellation_hours)) AS within_free_window
          FROM bookings b
          JOIN courts c ON c.id = b.court_id
          JOIN venues v ON v.id = c.venue_id
         WHERE b.id = $1
           FOR UPDATE OF b`,
        [bookingId],
      );
      if (!booking) throw new NotFoundException(apiError('BOOKING_NOT_FOUND', 'Booking not found'));

      const isStaff = hasRole(user, 'ADMIN') || (hasRole(user, 'VENUE_MANAGER') && booking.manager_user_id === user.id);
      const isOrganizer = booking.organizer_user_id === user.id;
      if (!isStaff && !isOrganizer) {
        throw new ForbiddenException(apiError('FORBIDDEN', 'Only the organizer or the venue can cancel this booking'));
      }
      if (booking.status !== 'HOLD' && booking.status !== 'CONFIRMED') {
        throw new ConflictException(apiError('NOT_CANCELLABLE', `A booking that is ${booking.status.toLowerCase()} cannot be cancelled`));
      }
      if (booking.status === 'CONFIRMED' && !isStaff && !booking.within_free_window) {
        throw new ConflictException(
          apiError(
            'CANCELLATION_WINDOW_CLOSED',
            `Free cancellation ended ${booking.free_cancellation_hours} hours before the start. Please contact the venue.`,
          ),
        );
      }

      await q.query(
        /* sql */ `
        UPDATE bookings
           SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3
         WHERE id = $1`,
        [bookingId, user.id, reason ?? null],
      );
      await this.closeOpenItems(q, bookingId, 'CANCELLED');
    });

    await this.queues.enqueueRelease(bookingId);
    return this.getBooking(user, bookingId);
  }

  /** Releases one hold whose deadline has passed. Returns false if it was paid or already handled. */
  async expireHold(bookingId: string): Promise<boolean> {
    const expired = await this.db.tx(async (q) => {
      const rows = await q.query<{ id: string }>(
        /* sql */ `
        UPDATE bookings
           SET status = 'EXPIRED', expired_at = now()
         WHERE id = $1 AND status = 'HOLD' AND hold_expires_at <= now()
        RETURNING id`,
        [bookingId],
      );
      if (rows.length === 0) return false;
      await this.closeOpenItems(q, bookingId, 'EXPIRED');
      return true;
    });

    if (expired) {
      this.logger.log(`Hold ${bookingId} expired unpaid — court released`);
      // Anyone who already paid their share gets it back.
      await this.queues.enqueueRelease(bookingId);
    }
    return expired;
  }

  /** Safety net, run every minute: expires overdue holds and closes out bookings whose slot is over. */
  async sweep(): Promise<{ expired: number; completed: number }> {
    const due = await this.db.query<{ id: string }>(
      /* sql */ `
      SELECT id
        FROM bookings
       WHERE status = 'HOLD' AND hold_expires_at <= now()
       ORDER BY hold_expires_at
       LIMIT 200`,
    );
    let expired = 0;
    for (const { id } of due) {
      if (await this.expireHold(id)) expired += 1;
    }

    const completed = await this.db.query<{ id: string }>(
      /* sql */ `
      UPDATE bookings
         SET status = 'COMPLETED'
       WHERE status = 'CONFIRMED' AND upper(slot_range) <= now()
      RETURNING id`,
    );
    return { expired, completed: completed.length };
  }

  /** Unpaid shares and open ringer requests die with the booking. */
  private async closeOpenItems(q: Queryable, bookingId: string, ringerStatus: 'CANCELLED' | 'EXPIRED') {
    await q.query(
      /* sql */ `
      UPDATE booking_split_shares
         SET status = 'CANCELLED'
       WHERE booking_id = $1 AND status = 'PENDING'`,
      [bookingId],
    );
    await q.query(
      /* sql */ `
      UPDATE ringer_requests
         SET status = $2::text
       WHERE booking_id = $1 AND status = 'OPEN'`,
      [bookingId, ringerStatus],
    );
  }
}
