import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { apiError } from '../common/api-error';
import { DatabaseService, PG_UNIQUE_VIOLATION, pgErrorCode } from '../database/database.service';
import { QueuesService } from '../queues/queues.service';
import { hasNextWave, inviteBudget, RINGER_MIN_RELIABILITY, RINGER_WAVE_INTERVAL_MS, ringerWave } from './ringer-waves';

/**
 * "Ringers" are substitute players recruited when a booking is short of people.
 * The organizer asks for N extra players; a background worker invites nearby players of
 * a similar level in widening waves, and the first N to accept get the places.
 *
 * Invitations are stored as rows; delivering them as push notifications is the job of
 * the notification service (not part of the backend core yet) — until then the app
 * reads GET /v1/ringer-invites/mine.
 */
@Injectable()
export class RingersService {
  private readonly logger = new Logger(RingersService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly queues: QueuesService,
  ) {}

  async createRequest(user: AuthUser, bookingId: string, slotsNeeded: number) {
    const [booking] = await this.db.query<{
      organizer_user_id: string;
      status: string;
      starts_at: Date;
      has_started: boolean;
      target_elo: number | null;
    }>(
      /* sql */ `
      SELECT b.organizer_user_id, b.status, lower(b.slot_range) AS starts_at,
             (lower(b.slot_range) <= now()) AS has_started,
             (SELECT round(avg(u.elo_rating))::int
                FROM booking_split_shares s JOIN users u ON u.id = s.user_id
               WHERE s.booking_id = b.id) AS target_elo
        FROM bookings b
       WHERE b.id = $1`,
      [bookingId],
    );
    if (!booking) throw new NotFoundException(apiError('BOOKING_NOT_FOUND', 'Booking not found'));
    if (booking.organizer_user_id !== user.id) {
      throw new ForbiddenException(apiError('FORBIDDEN', 'Only the organizer can look for extra players'));
    }
    if ((booking.status !== 'HOLD' && booking.status !== 'CONFIRMED') || booking.has_started) {
      throw new ConflictException(apiError('BOOKING_NOT_OPEN', 'Extra players can only be recruited for an upcoming booking'));
    }

    let request: { id: string; slots_needed: number; slots_filled: number; status: string; expires_at: Date };
    try {
      [request] = await this.db.query<typeof request>(
        /* sql */ `
        INSERT INTO ringer_requests (booking_id, requested_by, slots_needed, target_elo, expires_at)
        VALUES ($1, $2, $3, $4, $5::timestamptz)
        RETURNING id, slots_needed, slots_filled, status, expires_at`,
        [bookingId, user.id, slotsNeeded, booking.target_elo ?? 1200, booking.starts_at],
      );
    } catch (error) {
      if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(apiError('REQUEST_EXISTS', 'This booking is already looking for extra players'));
      }
      throw error;
    }

    await this.queues.enqueueRingerWave(request.id, 0);
    return request;
  }

  /**
   * Runs one recruitment wave (called by the ringer worker). Safe to retry: a wave that
   * already ran sends nothing new, and a player is never invited twice to the same request.
   */
  async runWave(requestId: string, wave: number): Promise<{ invited: number; state: 'RECRUITING' | 'CLOSED' }> {
    const result = await this.db.tx(async (q) => {
      const [request] = await q.query<{
        booking_id: string;
        slots_needed: number;
        slots_filled: number;
        target_elo: number;
        status: string;
        last_wave: number;
        is_expired: boolean;
        booking_status: string;
      }>(
        /* sql */ `
        SELECT r.booking_id, r.slots_needed, r.slots_filled, r.target_elo, r.status, r.last_wave,
               (r.expires_at <= now()) AS is_expired, b.status AS booking_status
          FROM ringer_requests r
          JOIN bookings b ON b.id = r.booking_id
         WHERE r.id = $1
           FOR UPDATE OF r`,
        [requestId],
      );
      if (!request || request.status !== 'OPEN') return { invited: 0, state: 'CLOSED' as const, next: false };

      const bookingLive = request.booking_status === 'HOLD' || request.booking_status === 'CONFIRMED';
      const params = ringerWave(wave);
      if (request.is_expired || !bookingLive || !params) {
        if (request.is_expired || !bookingLive) {
          await q.query(/* sql */ `UPDATE ringer_requests SET status = 'EXPIRED' WHERE id = $1`, [requestId]);
          await q.query(/* sql */ `UPDATE ringer_invites SET status = 'EXPIRED' WHERE request_id = $1 AND status = 'SENT'`, [requestId]);
        }
        return { invited: 0, state: 'CLOSED' as const, next: false };
      }

      // A retried job for a wave that already ran: do not invite again, but keep the chain going.
      if (wave <= request.last_wave) return { invited: 0, state: 'RECRUITING' as const, next: hasNextWave(wave) };

      const invited = await q.query<{ user_id: string }>(
        /* sql */ `
        INSERT INTO ringer_invites (request_id, user_id, wave, distance_m)
        SELECT $1, candidate.id, $2::int, candidate.distance_m
          FROM (
            SELECT u.id,
                   round(ST_Distance(u.home_location, v.location))::int AS distance_m,
                   abs(u.elo_rating - $3::int) AS elo_gap,
                   u.reliability_score
              FROM bookings b
              JOIN courts c ON c.id = b.court_id
              JOIN venues v ON v.id = c.venue_id
             CROSS JOIN users u
             WHERE b.id = $4
               AND u.is_active
               AND u.open_to_ringer
               AND u.home_location IS NOT NULL
               AND u.reliability_score >= $5::numeric
               AND abs(u.elo_rating - $3::int) <= $6::int
               AND ST_DWithin(u.home_location, v.location, $7::float8)
               AND u.id <> b.organizer_user_id
               AND NOT EXISTS (SELECT 1 FROM booking_split_shares s WHERE s.booking_id = b.id AND s.user_id = u.id)
               AND NOT EXISTS (SELECT 1 FROM ringer_invites i WHERE i.request_id = $1 AND i.user_id = u.id)
             ORDER BY u.reliability_score DESC, elo_gap, distance_m
             LIMIT $8::int
          ) AS candidate
        ON CONFLICT (request_id, user_id) DO NOTHING
        RETURNING user_id`,
        [
          requestId,
          wave,
          request.target_elo,
          request.booking_id,
          RINGER_MIN_RELIABILITY,
          params.eloGap,
          params.radiusKm * 1000,
          inviteBudget(request.slots_needed, request.slots_filled),
        ],
      );
      await q.query(/* sql */ `UPDATE ringer_requests SET last_wave = $2::int WHERE id = $1`, [requestId, wave]);
      return { invited: invited.length, state: 'RECRUITING' as const, next: hasNextWave(wave) };
    });

    if (result.next) await this.queues.enqueueRingerWave(requestId, wave + 1, RINGER_WAVE_INTERVAL_MS);
    this.logger.log(`Ringer request ${requestId} wave ${wave}: ${result.invited} invited, ${result.state.toLowerCase()}`);
    return { invited: result.invited, state: result.state };
  }

  listMyInvites(user: AuthUser) {
    return this.db.query(
      /* sql */ `
      SELECT i.id, i.status, i.distance_m, i.created_at,
             r.slots_needed, r.slots_filled, r.status AS request_status,
             lower(b.slot_range) AS starts_at, upper(b.slot_range) AS ends_at,
             c.name AS court_name, c.sport, v.name AS venue_name, v.city, v.requires_turf_footwear
        FROM ringer_invites i
        JOIN ringer_requests r ON r.id = i.request_id
        JOIN bookings b ON b.id = r.booking_id
        JOIN courts c ON c.id = b.court_id
        JOIN venues v ON v.id = c.venue_id
       WHERE i.user_id = $1
       ORDER BY i.created_at DESC
       LIMIT 50`,
      [user.id],
    );
  }

  /** Accept or decline an invitation. Places go to whoever accepts first. */
  async respond(user: AuthUser, inviteId: string, accept: boolean) {
    return this.db.tx(async (q) => {
      const [found] = await q.query<{ request_id: string; user_id: string }>(
        /* sql */ `SELECT request_id, user_id FROM ringer_invites WHERE id = $1`,
        [inviteId],
      );
      if (!found || found.user_id !== user.id) throw new NotFoundException(apiError('INVITE_NOT_FOUND', 'Invitation not found'));

      // Lock the request first so two players accepting the last place are served one at a time.
      const [request] = await q.query<{ status: string; slots_needed: number; slots_filled: number; is_expired: boolean }>(
        /* sql */ `
        SELECT status, slots_needed, slots_filled, (expires_at <= now()) AS is_expired
          FROM ringer_requests
         WHERE id = $1
           FOR UPDATE`,
        [found.request_id],
      );
      const [invite] = await q.query<{ status: string }>(
        /* sql */ `SELECT status FROM ringer_invites WHERE id = $1 FOR UPDATE`,
        [inviteId],
      );
      if (!request || !invite) throw new NotFoundException(apiError('INVITE_NOT_FOUND', 'Invitation not found'));
      if (invite.status !== 'SENT') {
        throw new ConflictException(apiError('INVITE_CLOSED', 'This invitation has already been answered or has expired'));
      }

      if (!accept) {
        await q.query(/* sql */ `UPDATE ringer_invites SET status = 'DECLINED', responded_at = now() WHERE id = $1`, [inviteId]);
        return { invite_id: inviteId, status: 'DECLINED' };
      }

      if (request.status !== 'OPEN' || request.is_expired || request.slots_filled >= request.slots_needed) {
        throw new ConflictException(apiError('REQUEST_CLOSED', 'All places have been taken'));
      }

      await q.query(/* sql */ `UPDATE ringer_invites SET status = 'ACCEPTED', responded_at = now() WHERE id = $1`, [inviteId]);
      const [updated] = await q.query<{ status: string }>(
        /* sql */ `
        UPDATE ringer_requests
           SET slots_filled = slots_filled + 1,
               status = CASE WHEN slots_filled + 1 >= slots_needed THEN 'FILLED' ELSE status END
         WHERE id = $1
        RETURNING status`,
        [found.request_id],
      );
      if (updated.status === 'FILLED') {
        await q.query(/* sql */ `UPDATE ringer_invites SET status = 'EXPIRED' WHERE request_id = $1 AND status = 'SENT'`, [found.request_id]);
      }
      return { invite_id: inviteId, status: 'ACCEPTED' };
    });
  }
}
