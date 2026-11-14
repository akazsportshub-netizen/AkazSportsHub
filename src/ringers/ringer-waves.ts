/**
 * Ringer recruitment widens in waves. Each wave invites players a little further away
 * and a little further from the group's skill level than the wave before, so the best
 * matches are asked first and the net only spreads if they do not answer.
 */
export interface RingerWave {
  /** Search radius around the venue. */
  radiusKm: number;
  /** Largest allowed difference between a candidate's ELO and the group's. */
  eloGap: number;
}

export const RINGER_WAVES: readonly RingerWave[] = [
  { radiusKm: 5, eloGap: 100 },
  { radiusKm: 10, eloGap: 200 },
  { radiusKm: 20, eloGap: 300 },
  { radiusKm: 40, eloGap: 450 },
];

/** Pause between waves, giving invited players time to answer. */
export const RINGER_WAVE_INTERVAL_MS = 5 * 60_000;

/** Players below this reliability score (0–100) are never invited. */
export const RINGER_MIN_RELIABILITY = 70;

/** Invitations sent per open place in each wave; the first to accept get the places. */
export const RINGER_INVITES_PER_SLOT = 3;

export function ringerWave(wave: number): RingerWave | null {
  return Number.isInteger(wave) && wave >= 0 && wave < RINGER_WAVES.length ? RINGER_WAVES[wave] : null;
}

export function hasNextWave(wave: number): boolean {
  return ringerWave(wave + 1) !== null;
}

/** How many invitations a wave may send for the places still open. */
export function inviteBudget(slotsNeeded: number, slotsFilled: number): number {
  return Math.max(0, slotsNeeded - slotsFilled) * RINGER_INVITES_PER_SLOT;
}
