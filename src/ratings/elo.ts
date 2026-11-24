/** Skill ratings (Elo). Pure functions, so the rules can be tested without a database. */

export const DEFAULT_RATING = 1200;
export const MIN_RATING = 100;
export const MAX_RATING = 3000;
/** A player's first matches move their rating faster, so it settles quickly. */
export const PROVISIONAL_MATCHES = 10;

/** Chance (0..1) that a side rated `own` beats a side rated `opponent`. */
export function expectedScore(own: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - own) / 400));
}

export function kFactor(ratedMatches: number): number {
  return ratedMatches < PROVISIONAL_MATCHES ? 40 : 24;
}

/** A bigger win counts a little more: +10% per goal of difference, up to +50%. A draw counts as 1. */
export function marginMultiplier(goalDifference: number): number {
  return 1 + Math.min(Math.abs(goalDifference), 5) * 0.1;
}

export interface RatedPlayer {
  userId: string;
  rating: number;
  ratedMatches: number;
}

export interface RatingChange {
  userId: string;
  before: number;
  after: number;
  delta: number;
}

export function teamRating(players: readonly { rating: number }[]): number {
  if (players.length === 0) return DEFAULT_RATING;
  return players.reduce((sum, player) => sum + player.rating, 0) / players.length;
}

/**
 * New ratings for everyone in a finished match. Each side is compared by its average rating;
 * every player moves by their own K factor. Returns nothing when a side has no players.
 */
export function computeRatingChanges(
  home: readonly RatedPlayer[],
  away: readonly RatedPlayer[],
  homeScore: number,
  awayScore: number,
): RatingChange[] {
  if (home.length === 0 || away.length === 0) return [];
  const homeRating = teamRating(home);
  const awayRating = teamRating(away);
  const multiplier = marginMultiplier(homeScore - awayScore);
  const homeResult = homeScore > awayScore ? 1 : homeScore === awayScore ? 0.5 : 0;

  const side = (players: readonly RatedPlayer[], own: number, opponent: number, result: number) =>
    players.map((player) => {
      const raw = Math.round(kFactor(player.ratedMatches) * multiplier * (result - expectedScore(own, opponent)));
      const after = Math.min(MAX_RATING, Math.max(MIN_RATING, player.rating + raw));
      return { userId: player.userId, before: player.rating, after, delta: after - player.rating };
    });

  return [...side(home, homeRating, awayRating, homeResult), ...side(away, awayRating, homeRating, 1 - homeResult)];
}
