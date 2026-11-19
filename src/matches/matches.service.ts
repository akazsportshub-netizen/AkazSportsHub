import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuthUser, hasRole } from '../auth/auth.types';
import { apiError } from '../common/api-error';
import { DatabaseService, PG_UNIQUE_VIOLATION, pgErrorCode, Queryable } from '../database/database.service';
import { CreateMatchDto, SyncMatchEventsDto } from './dto/match.dto';
import { MAX_CLOCK_SKEW_MS, requiresTeamSide, sinBinReleaseAt } from './sin-bin';

interface MatchRow {
  id: string;
  booking_id: string | null;
  court_id: string;
  referee_user_id: string | null;
  home_team_name: string;
  away_team_name: string;
  status: string;
  scheduled_start: Date;
  started_at: Date | null;
  ended_at: Date | null;
  home_score: number;
  away_score: number;
}

export interface ActiveSinBin {
  event_id: string;
  team_side: string;
  player_user_id: string | null;
  player_name: string | null;
  shirt_number: number | null;
  occurred_at: Date;
  sin_bin_release_at: Date;
  seconds_remaining: number;
}

export type RejectedReason = 'ID_IN_USE' | 'TEAM_SIDE_REQUIRED' | 'OCCURRED_IN_FUTURE' | 'UNKNOWN_PLAYER';

export interface SyncResult {
  accepted: string[];
  duplicates: string[];
  rejected: { id: string; reason: RejectedReason }[];
  match: MatchRow;
  active_sin_bins: ActiveSinBin[];
  /** Lets the device measure its clock offset against the server. */
  server_time: Date;
}

const MATCH_COLUMNS = `id, booking_id, court_id, referee_user_id, home_team_name, away_team_name, status,
       scheduled_start, started_at, ended_at, home_score, away_score`;

@Injectable()
export class MatchesService {
  constructor(private readonly db: DatabaseService) {}

  async create(user: AuthUser, dto: CreateMatchDto): Promise<MatchRow> {
    const refereeId = dto.referee_user_id ?? (hasRole(user, 'REFEREE') ? user.id : null);

    const [court] = await this.db.query<{ id: string }>(/* sql */ `SELECT id FROM courts WHERE id = $1`, [dto.court_id]);
    if (!court) throw new NotFoundException(apiError('COURT_NOT_FOUND', 'Court not found'));

    if (refereeId) {
      const [referee] = await this.db.query<{ user_id: string }>(
        /* sql */ `SELECT user_id FROM user_roles WHERE user_id = $1 AND role = 'REFEREE'`,
        [refereeId],
      );
      if (!referee) throw new UnprocessableEntityException(apiError('NOT_A_REFEREE', 'The chosen referee does not hold the referee role'));
    }

    if (dto.booking_id) {
      const [booking] = await this.db.query<{ court_id: string }>(
        /* sql */ `SELECT court_id FROM bookings WHERE id = $1`,
        [dto.booking_id],
      );
      if (!booking) throw new NotFoundException(apiError('BOOKING_NOT_FOUND', 'Booking not found'));
      if (booking.court_id !== dto.court_id) {
        throw new UnprocessableEntityException(apiError('BOOKING_COURT_MISMATCH', 'The booking is for a different court'));
      }
    }

    try {
      const [match] = await this.db.query<MatchRow>(
        /* sql */ `
        INSERT INTO matches (booking_id, court_id, referee_user_id, home_team_name, away_team_name, scheduled_start, created_by)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7)
        RETURNING ${MATCH_COLUMNS}`,
        [dto.booking_id ?? null, dto.court_id, refereeId, dto.home_team_name.trim(), dto.away_team_name.trim(), dto.scheduled_start, user.id],
      );
      return match;
    } catch (error) {
      if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(apiError('MATCH_EXISTS', 'A match already exists for this booking'));
      }
      throw error;
    }
  }

  async get(matchId: string) {
    const [match] = await this.db.query<MatchRow>(/* sql */ `SELECT ${MATCH_COLUMNS} FROM matches WHERE id = $1`, [matchId]);
    if (!match) throw new NotFoundException(apiError('MATCH_NOT_FOUND', 'Match not found'));

    const events = await this.db.query(
      /* sql */ `
      SELECT id, event_type AS type, team_side, player_user_id, player_name, shirt_number,
             match_clock_seconds, occurred_at, sin_bin_release_at, note
        FROM match_events
       WHERE match_id = $1
       ORDER BY occurred_at, match_clock_seconds, id`,
      [matchId],
    );
    return { ...match, events, active_sin_bins: await this.activeSinBins(this.db, matchId), server_time: new Date() };
  }

  async getSinBins(matchId: string) {
    const [match] = await this.db.query<{ id: string }>(/* sql */ `SELECT id FROM matches WHERE id = $1`, [matchId]);
    if (!match) throw new NotFoundException(apiError('MATCH_NOT_FOUND', 'Match not found'));
    return { match_id: matchId, active_sin_bins: await this.activeSinBins(this.db, matchId), server_time: new Date() };
  }

  /**
   * Stores a batch of events recorded on a referee's device, typically after the device
   * comes back online. The call is idempotent: each event carries a device-generated id,
   * so a batch that is re-sent (the response got lost, the app retried) changes nothing
   * the second time. One bad event never blocks the rest of the batch — it is reported
   * under `rejected` and the others are stored.
   */
  async syncEvents(user: AuthUser, rawMatchId: string, dto: SyncMatchEventsDto): Promise<SyncResult> {
    const matchId = rawMatchId.toLowerCase();   // Postgres returns uuids in lower case; compare like with like
    return this.db.tx(async (q) => {
      // Row lock: two devices syncing the same match are processed one after the other.
      const [locked] = await q.query<{ referee_user_id: string | null }>(
        /* sql */ `SELECT referee_user_id FROM matches WHERE id = $1 FOR UPDATE`,
        [matchId],
      );
      if (!locked) throw new NotFoundException(apiError('MATCH_NOT_FOUND', 'Match not found'));
      if (!hasRole(user, 'ADMIN') && locked.referee_user_id !== user.id) {
        throw new ForbiddenException(apiError('NOT_MATCH_REFEREE', 'Only the referee assigned to this match can record its events'));
      }

      const ids = dto.events.map((event) => event.id.toLowerCase());
      const existing = await q.query<{ id: string; match_id: string }>(
        /* sql */ `SELECT id, match_id FROM match_events WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      const existingMatchById = new Map(existing.map((row) => [row.id, row.match_id]));

      const playerIds = [...new Set(dto.events.flatMap((event) => (event.player_user_id ? [event.player_user_id.toLowerCase()] : [])))];
      const knownPlayers = new Set(
        playerIds.length === 0
          ? []
          : (await q.query<{ id: string }>(/* sql */ `SELECT id FROM users WHERE id = ANY($1::uuid[])`, [playerIds])).map((row) => row.id),
      );

      const accepted: string[] = [];
      const duplicates: string[] = [];
      const rejected: SyncResult['rejected'] = [];
      const seenInBatch = new Set<string>();
      const latestAllowed = Date.now() + MAX_CLOCK_SKEW_MS;

      for (const event of dto.events) {
        const id = event.id.toLowerCase();

        const storedForMatch = existingMatchById.get(id);
        if (storedForMatch !== undefined) {
          if (storedForMatch === matchId) duplicates.push(id);
          else rejected.push({ id, reason: 'ID_IN_USE' });
          continue;
        }
        if (seenInBatch.has(id)) {
          duplicates.push(id);
          continue;
        }
        seenInBatch.add(id);

        const occurredAt = new Date(event.occurred_at);
        if (requiresTeamSide(event.type) && !event.team_side) {
          rejected.push({ id, reason: 'TEAM_SIDE_REQUIRED' });
          continue;
        }
        if (occurredAt.getTime() > latestAllowed) {
          rejected.push({ id, reason: 'OCCURRED_IN_FUTURE' });
          continue;
        }
        const playerId = event.player_user_id ? event.player_user_id.toLowerCase() : null;
        if (playerId && !knownPlayers.has(playerId)) {
          rejected.push({ id, reason: 'UNKNOWN_PLAYER' });
          continue;
        }

        const inserted = await q.query<{ id: string }>(
          /* sql */ `
          INSERT INTO match_events
            (id, match_id, event_type, team_side, player_user_id, player_name, shirt_number,
             match_clock_seconds, occurred_at, sin_bin_release_at, note, recorded_by, device_id)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11, $12, $13)
          ON CONFLICT (id) DO NOTHING
          RETURNING id`,
          [
            id,
            matchId,
            event.type,
            event.team_side ?? null,
            playerId,
            event.player_name?.trim() || null,
            event.shirt_number ?? null,
            event.match_clock_seconds,
            occurredAt,
            sinBinReleaseAt(event.type, occurredAt),
            event.note?.trim() || null,
            user.id,
            dto.device_id ?? null,
          ],
        );
        if (inserted.length > 0) accepted.push(id);
        else duplicates.push(id);
      }

      const match = await this.recalculate(q, matchId);
      return {
        accepted,
        duplicates,
        rejected,
        match,
        active_sin_bins: await this.activeSinBins(q, matchId),
        server_time: new Date(),
      };
    });
  }

  /**
   * Rebuilds score, status and start/end times from the full event log. Recomputing from
   * scratch (instead of incrementing) keeps the result correct whatever order the
   * events arrive in. An abandoned match stays abandoned.
   */
  private async recalculate(q: Queryable, matchId: string): Promise<MatchRow> {
    const [match] = await q.query<MatchRow>(
      /* sql */ `
      UPDATE matches m
         SET home_score = agg.home_score,
             away_score = agg.away_score,
             started_at = COALESCE(agg.first_start, m.started_at),
             ended_at = COALESCE(agg.last_end, m.ended_at),
             status = CASE
                        WHEN m.status = 'ABANDONED' THEN 'ABANDONED'
                        WHEN agg.last_end IS NOT NULL THEN 'FINISHED'
                        WHEN agg.first_start IS NOT NULL THEN 'LIVE'
                        ELSE m.status
                      END
        FROM (
          SELECT count(*) FILTER (WHERE (e.event_type = 'GOAL' AND e.team_side = 'HOME')
                                     OR (e.event_type = 'OWN_GOAL' AND e.team_side = 'AWAY'))::int AS home_score,
                 count(*) FILTER (WHERE (e.event_type = 'GOAL' AND e.team_side = 'AWAY')
                                     OR (e.event_type = 'OWN_GOAL' AND e.team_side = 'HOME'))::int AS away_score,
                 min(e.occurred_at) FILTER (WHERE e.event_type = 'MATCH_START') AS first_start,
                 max(e.occurred_at) FILTER (WHERE e.event_type = 'MATCH_END') AS last_end
            FROM match_events e
           WHERE e.match_id = $1
        ) agg
       WHERE m.id = $1
      RETURNING m.id, m.booking_id, m.court_id, m.referee_user_id, m.home_team_name, m.away_team_name, m.status,
                m.scheduled_start, m.started_at, m.ended_at, m.home_score, m.away_score`,
      [matchId],
    );
    return match;
  }

  /** Players currently serving a White Card sin bin, soonest release first. */
  private activeSinBins(q: Queryable, matchId: string): Promise<ActiveSinBin[]> {
    return q.query<ActiveSinBin>(
      /* sql */ `
      SELECT e.id AS event_id, e.team_side, e.player_user_id, e.player_name, e.shirt_number,
             e.occurred_at, e.sin_bin_release_at,
             GREATEST(0, ceil(extract(epoch FROM (e.sin_bin_release_at - now()))))::int AS seconds_remaining
        FROM match_events e
       WHERE e.match_id = $1
         AND e.event_type = 'WHITE_CARD'
         AND e.sin_bin_release_at > now()
       ORDER BY e.sin_bin_release_at`,
      [matchId],
    );
  }
}
