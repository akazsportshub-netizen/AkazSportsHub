import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuthUser, hasRole } from '../auth/auth.types';
import { apiError, errorMessage } from '../common/api-error';
import { DatabaseService, Queryable } from '../database/database.service';
import { balanceTeams } from './balance';
import { computeRatingChanges, expectedScore, teamRating } from './elo';

interface MatchAccess {
  id: string;
  booking_id: string | null;
  status: string;
  referee_user_id: string | null;
  manager_user_id: string | null;
  rated_at: Date | null;
}

type Side = 'HOME' | 'AWAY';

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(private readonly db: DatabaseService) {}

  private async loadMatch(q: Queryable, matchId: string, lock: boolean): Promise<MatchAccess> {
    const [match] = await q.query<MatchAccess>(
      /* sql */ `
      SELECT m.id, m.booking_id, m.status, m.referee_user_id, m.rated_at, v.manager_user_id
        FROM matches m JOIN courts c ON c.id = m.court_id JOIN venues v ON v.id = c.venue_id
       WHERE m.id = $1 ${lock ? 'FOR UPDATE OF m' : ''}`,
      [matchId],
    );
    if (!match) throw new NotFoundException(apiError('MATCH_NOT_FOUND', 'Match not found'));
    return match;
  }

  /** The match's referee, the venue's manager and admins may set the teams. */
  private canManage(user: AuthUser, match: MatchAccess): boolean {
    return hasRole(user, 'ADMIN') || match.referee_user_id === user.id || (hasRole(user, 'VENUE_MANAGER') && match.manager_user_id === user.id);
  }

  private assertCanManage(user: AuthUser, match: MatchAccess) {
    if (!this.canManage(user, match)) {
      throw new ForbiddenException(apiError('NOT_ALLOWED', 'Only the referee, the venue manager or an admin can set the teams'));
    }
    if (match.status !== 'SCHEDULED') {
      throw new ConflictException(apiError('MATCH_STARTED', 'Teams cannot change once the match has started'));
    }
  }

  /** Splits the booking's paid players into two teams of similar strength. Replaces any earlier split. */
  async autoBalance(user: AuthUser, matchId: string) {
    return this.db.tx(async (q) => {
      const match = await this.loadMatch(q, matchId, true);
      this.assertCanManage(user, match);
      if (!match.booking_id) {
        throw new UnprocessableEntityException(apiError('NO_BOOKING', 'This match is not linked to a booking, so there are no players to split.'));
      }
      const players = await q.query<{ user_id: string; rating: number }>(
        /* sql */ `
        SELECT s.user_id, u.elo_rating AS rating
          FROM booking_split_shares s JOIN users u ON u.id = s.user_id
         WHERE s.booking_id = $1 AND s.status = 'PAID'`,
        [match.booking_id],
      );
      if (players.length < 2) {
        throw new UnprocessableEntityException(apiError('NOT_ENOUGH_PLAYERS', 'At least two players must have paid for the booking.'));
      }
      const teams = balanceTeams(players.map((p) => ({ userId: p.user_id, rating: p.rating })));
      await q.query(/* sql */ `DELETE FROM match_players WHERE match_id = $1`, [matchId]);
      await q.query(
        /* sql */ `
        INSERT INTO match_players (match_id, user_id, side)
        SELECT $1, t.user_id, t.side FROM unnest($2::uuid[], $3::text[]) AS t(user_id, side)`,
        [matchId, [...teams.home, ...teams.away], [...teams.home.map(() => 'HOME'), ...teams.away.map(() => 'AWAY')]],
      );
      return this.teamsOf(q, matchId);
    });
  }

  /** Moves players between sides. Only people already in the split can be moved. */
  async setTeams(user: AuthUser, matchId: string, assignments: { user_id: string; side: Side }[]) {
    return this.db.tx(async (q) => {
      const match = await this.loadMatch(q, matchId, true);
      this.assertCanManage(user, match);
      const current = await q.query<{ user_id: string }>(/* sql */ `SELECT user_id FROM match_players WHERE match_id = $1`, [matchId]);
      const known = new Set(current.map((row) => row.user_id));
      for (const a of assignments) {
        if (!known.has(a.user_id.toLowerCase())) {
          throw new UnprocessableEntityException(apiError('UNKNOWN_PLAYER', 'That player is not part of this match. Auto-balance first.'));
        }
      }
      await q.query(
        /* sql */ `
        UPDATE match_players mp SET side = t.side
          FROM unnest($2::uuid[], $3::text[]) AS t(user_id, side)
         WHERE mp.match_id = $1 AND mp.user_id = t.user_id`,
        [matchId, assignments.map((a) => a.user_id), assignments.map((a) => a.side)],
      );
      return this.teamsOf(q, matchId);
    });
  }

  async getTeams(user: AuthUser, matchId: string) {
    const match = await this.loadMatch(this.db, matchId, false);
    if (!this.canManage(user, match)) {
      const [player] = await this.db.query<{ user_id: string }>(
        /* sql */ `SELECT user_id FROM match_players WHERE match_id = $1 AND user_id = $2`,
        [matchId, user.id],
      );
      if (!player) throw new ForbiddenException(apiError('NOT_ALLOWED', 'Only people in this match can see its teams'));
    }
    return this.teamsOf(this.db, matchId);
  }

  private async teamsOf(q: Queryable, matchId: string) {
    const players = await q.query<{ user_id: string; full_name: string; side: Side; rating: number }>(
      /* sql */ `
      SELECT mp.user_id, u.full_name, mp.side, coalesce(mp.rating_before, u.elo_rating) AS rating
        FROM match_players mp JOIN users u ON u.id = mp.user_id
       WHERE mp.match_id = $1
       ORDER BY mp.side DESC, rating DESC, u.full_name`,
      [matchId],
    );
    const home = players.filter((p) => p.side === 'HOME');
    const away = players.filter((p) => p.side === 'AWAY');
    const homeAvg = Math.round(teamRating(home));
    const awayAvg = Math.round(teamRating(away));
    return {
      match_id: matchId,
      players,
      home_avg: home.length ? homeAvg : null,
      away_avg: away.length ? awayAvg : null,
      home_win_probability: home.length && away.length ? Math.round(expectedScore(teamRating(home), teamRating(away)) * 100) / 100 : null,
    };
  }

  /**
   * Applies a finished match to the players' ratings, once. Only refereed matches with players on
   * both sides count; that is what makes the ratings verified. Never throws: a failure here must
   * not stop the referee's events from being saved.
   */
  async rateFinishedMatch(matchId: string): Promise<boolean> {
    try {
      return await this.db.tx(async (q) => {
        const [match] = await q.query<{ status: string; rated_at: Date | null; referee_user_id: string | null; home_score: number; away_score: number }>(
          /* sql */ `SELECT status, rated_at, referee_user_id, home_score, away_score FROM matches WHERE id = $1 FOR UPDATE`,
          [matchId],
        );
        if (!match || match.status !== 'FINISHED' || match.rated_at || !match.referee_user_id) return false;

        const rows = await q.query<{ user_id: string; side: Side; rating: number; rated_matches: number }>(
          /* sql */ `
          SELECT mp.user_id, mp.side, u.elo_rating AS rating, u.rated_matches
            FROM match_players mp JOIN users u ON u.id = mp.user_id
           WHERE mp.match_id = $1
           ORDER BY mp.user_id
             FOR UPDATE OF u`,
          [matchId],
        );
        const toPlayer = (r: (typeof rows)[number]) => ({ userId: r.user_id, rating: r.rating, ratedMatches: r.rated_matches });
        const changes = computeRatingChanges(
          rows.filter((r) => r.side === 'HOME').map(toPlayer),
          rows.filter((r) => r.side === 'AWAY').map(toPlayer),
          match.home_score,
          match.away_score,
        );
        if (changes.length === 0) return false;

        await q.query(
          /* sql */ `
          UPDATE users u SET elo_rating = t.after, rated_matches = u.rated_matches + 1
            FROM unnest($1::uuid[], $2::int[]) AS t(user_id, after) WHERE u.id = t.user_id`,
          [changes.map((c) => c.userId), changes.map((c) => c.after)],
        );
        await q.query(
          /* sql */ `
          UPDATE match_players mp SET rating_before = t.before, rating_after = t.after
            FROM unnest($2::uuid[], $3::int[], $4::int[]) AS t(user_id, before, after)
           WHERE mp.match_id = $1 AND mp.user_id = t.user_id`,
          [matchId, changes.map((c) => c.userId), changes.map((c) => c.before), changes.map((c) => c.after)],
        );
        await q.query(/* sql */ `UPDATE matches SET rated_at = now() WHERE id = $1`, [matchId]);
        return true;
      });
    } catch (error) {
      this.logger.error(`Could not update ratings for match ${matchId}: ${errorMessage(error)}`);
      return false;
    }
  }

  async myRating(user: AuthUser) {
    const [me] = await this.db.query<{ elo_rating: number; rated_matches: number }>(
      /* sql */ `SELECT elo_rating, rated_matches FROM users WHERE id = $1`,
      [user.id],
    );
    const history = await this.db.query(
      /* sql */ `
      SELECT m.id AS match_id, m.ended_at, mp.side, mp.rating_before, mp.rating_after,
             (mp.rating_after - mp.rating_before) AS delta,
             m.home_team_name, m.away_team_name, m.home_score, m.away_score
        FROM match_players mp JOIN matches m ON m.id = mp.match_id
       WHERE mp.user_id = $1 AND mp.rating_after IS NOT NULL
       ORDER BY m.ended_at DESC NULLS LAST
       LIMIT 10`,
      [user.id],
    );
    return { elo_rating: me?.elo_rating ?? 1200, rated_matches: me?.rated_matches ?? 0, history };
  }

  /** Confirmed bookings around now on a court that have no match yet: what a referee can start a rated match from. */
  candidateBookings(courtId: string) {
    return this.db.query(
      /* sql */ `
      SELECT b.id, lower(b.slot_range) AS starts_at, upper(b.slot_range) AS ends_at,
             u.full_name AS organizer_name,
             (SELECT count(*)::int FROM booking_split_shares s WHERE s.booking_id = b.id AND s.status = 'PAID') AS paid_players
        FROM bookings b
        JOIN users u ON u.id = b.organizer_user_id
        LEFT JOIN matches m ON m.booking_id = b.id
       WHERE b.court_id = $1
         AND b.status IN ('CONFIRMED', 'COMPLETED')
         AND m.id IS NULL
         AND b.slot_range && tstzrange(now() - interval '3 hours', now() + interval '12 hours', '[)')
       ORDER BY lower(b.slot_range)
       LIMIT 20`,
      [courtId],
    );
  }
}
