/** Rules for the venue manager console that need no database, so they can be tested alone. */

export const MAX_BLOCK_DAYS = 31;
export const MAX_BLOCK_AHEAD_DAYS = 366;

export type BlockProblem = 'END_BEFORE_START' | 'TOO_LONG' | 'IN_THE_PAST' | 'TOO_FAR_AHEAD';

/** Why a block's times are not acceptable, or null when they are. */
export function blockProblem(startsAt: Date, endsAt: Date, now: Date): BlockProblem | null {
  if (!(endsAt.getTime() > startsAt.getTime())) return 'END_BEFORE_START';
  if (endsAt.getTime() - startsAt.getTime() > MAX_BLOCK_DAYS * 86_400_000) return 'TOO_LONG';
  if (endsAt.getTime() <= now.getTime()) return 'IN_THE_PAST';
  if (startsAt.getTime() > now.getTime() + MAX_BLOCK_AHEAD_DAYS * 86_400_000) return 'TOO_FAR_AHEAD';
  return null;
}

export const BLOCK_MESSAGES: Record<BlockProblem, string> = {
  END_BEFORE_START: 'The end must be after the start.',
  TOO_LONG: `A block can last at most ${MAX_BLOCK_DAYS} days.`,
  IN_THE_PAST: 'That time has already passed.',
  TOO_FAR_AHEAD: 'Blocks can be set at most a year ahead.',
};

/** Changing these (or switching a court off) would disturb bookings already made, so they wait until none are left. */
export const SCHEDULE_FIELDS = ['slot_minutes', 'opens_at', 'closes_at', 'is_active'] as const;

export function touchesSchedule(patch: Record<string, unknown>): boolean {
  if (patch.is_active === false) return true;
  return ['slot_minutes', 'opens_at', 'closes_at'].some((field) => patch[field] !== undefined);
}

export interface EarningsRow {
  bookings: number;
  gross_minor: number;
  commission_minor: number;
}

/** What the venue keeps: the booking total minus AKAZ's commission. */
export function netMinor(row: Pick<EarningsRow, 'gross_minor' | 'commission_minor'>): number {
  return row.gross_minor - row.commission_minor;
}

export function sumEarnings(rows: EarningsRow[]): EarningsRow & { net_minor: number } {
  const total = rows.reduce(
    (sum, row) => ({
      bookings: sum.bookings + row.bookings,
      gross_minor: sum.gross_minor + row.gross_minor,
      commission_minor: sum.commission_minor + row.commission_minor,
    }),
    { bookings: 0, gross_minor: 0, commission_minor: 0 },
  );
  return { ...total, net_minor: netMinor(total) };
}
