/** Largest group that can split one booking (two 11-a-side squads). */
export const MAX_SHARES = 22;

export interface ShareInput {
  userId: string;
  /** Leave unset on every share for an equal split; set on every share for a custom split. */
  amountMinor?: number;
}

export interface ShareAllocation {
  userId: string;
  amountMinor: number;
}

export type SplitErrorCode =
  | 'NO_SHARES'
  | 'TOO_MANY_SHARES'
  | 'DUPLICATE_PAYER'
  | 'INVALID_TOTAL'
  | 'MIXED_SPLIT'
  | 'INVALID_SHARE_AMOUNT'
  | 'SHARES_DO_NOT_ADD_UP'
  | 'TOTAL_TOO_SMALL_TO_SPLIT';

export class SplitError extends Error {
  constructor(
    public readonly code: SplitErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SplitError';
  }
}

/**
 * Turns a booking total into one amount per payer, in minor units, such that the
 * shares always add up to exactly the total — no fils or halala is lost or invented.
 *
 * Equal split: everyone pays floor(total / n); the remainder is handed out one minor
 * unit at a time starting with the first payer (the organizer, by convention).
 * Custom split: the caller's amounts are used as given and must sum to the total.
 */
export function allocateShares(totalMinor: number, inputs: readonly ShareInput[]): ShareAllocation[] {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    throw new SplitError('INVALID_TOTAL', 'Booking total must be a positive whole number of minor units');
  }
  if (inputs.length === 0) throw new SplitError('NO_SHARES', 'At least one payer is required');
  if (inputs.length > MAX_SHARES) {
    throw new SplitError('TOO_MANY_SHARES', `A booking can be split between at most ${MAX_SHARES} payers`);
  }

  const seen = new Set<string>();
  for (const input of inputs) {
    const key = input.userId.toLowerCase();
    if (seen.has(key)) throw new SplitError('DUPLICATE_PAYER', 'Each payer can appear only once');
    seen.add(key);
  }

  const withAmount = inputs.filter((input) => input.amountMinor !== undefined).length;
  if (withAmount !== 0 && withAmount !== inputs.length) {
    throw new SplitError('MIXED_SPLIT', 'Give an amount for every payer, or for none to split equally');
  }

  if (withAmount === 0) {
    const count = inputs.length;
    const base = Math.floor(totalMinor / count);
    const remainder = totalMinor - base * count;
    if (base === 0) {
      throw new SplitError('TOTAL_TOO_SMALL_TO_SPLIT', 'Booking total is too small to split between this many payers');
    }
    return inputs.map((input, index) => ({
      userId: input.userId,
      amountMinor: base + (index < remainder ? 1 : 0),
    }));
  }

  let sum = 0;
  const allocations = inputs.map((input) => {
    const amount = input.amountMinor as number;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new SplitError('INVALID_SHARE_AMOUNT', 'Each share must be a positive whole number of minor units');
    }
    sum += amount;
    return { userId: input.userId, amountMinor: amount };
  });
  if (sum !== totalMinor) {
    throw new SplitError('SHARES_DO_NOT_ADD_UP', `Shares add up to ${sum} but the booking total is ${totalMinor}`);
  }
  return allocations;
}
