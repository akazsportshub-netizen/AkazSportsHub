/** A White Card sends the player to the sin bin for two minutes. */
export const SIN_BIN_SECONDS = 120;

/** How far ahead of the server a referee device's clock may run before an event is refused. */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export const MATCH_EVENT_TYPES = [
  'MATCH_START',
  'MATCH_END',
  'PERIOD_START',
  'PERIOD_END',
  'GOAL',
  'OWN_GOAL',
  'YELLOW_CARD',
  'RED_CARD',
  'WHITE_CARD',
  'SUBSTITUTION',
] as const;
export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];

export type TeamSide = 'HOME' | 'AWAY';

/** Events about the match as a whole; everything else belongs to one team. */
const STRUCTURAL_EVENTS: ReadonlySet<MatchEventType> = new Set(['MATCH_START', 'MATCH_END', 'PERIOD_START', 'PERIOD_END']);

export function requiresTeamSide(type: MatchEventType): boolean {
  return !STRUCTURAL_EVENTS.has(type);
}

/**
 * When a sin-binned player may return: two minutes of wall-clock time after the card.
 * It is derived from the moment the referee showed the card (the device timestamp),
 * not from when the event reached the server, so an offline sync does not shift it.
 * Returns null for every event that is not a White Card.
 */
export function sinBinReleaseAt(type: MatchEventType, occurredAt: Date): Date | null {
  if (type !== 'WHITE_CARD') return null;
  return new Date(occurredAt.getTime() + SIN_BIN_SECONDS * 1000);
}

/** Whole seconds left in the sin bin at `now`, never negative. */
export function sinBinSecondsRemaining(releaseAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((releaseAt.getTime() - now.getTime()) / 1000));
}

export interface ScoreEvent {
  type: MatchEventType;
  teamSide: TeamSide | null;
}

/** Score implied by a set of events: a goal counts for the scorer's side, an own goal for the other. */
export function scoreFromEvents(events: readonly ScoreEvent[]): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const event of events) {
    if (event.type === 'GOAL') {
      if (event.teamSide === 'HOME') home += 1;
      else if (event.teamSide === 'AWAY') away += 1;
    } else if (event.type === 'OWN_GOAL') {
      if (event.teamSide === 'HOME') away += 1;
      else if (event.teamSide === 'AWAY') home += 1;
    }
  }
  return { home, away };
}
