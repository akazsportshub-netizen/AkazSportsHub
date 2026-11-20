/**
 * When a ringer joins a paid booking, everyone pays an equal share of the total. People
 * who already paid more than their new share get the difference refunded.
 */
export interface PaidShare {
  shareId: string;
  attemptId: string;
  /** What this person has paid and not had refunded (or been promised back) so far. */
  paidMinor: number;
  isRinger: boolean;
  createdAt: number;
}

export interface RebalanceStep {
  shareId: string;
  attemptId: string;
  /** The share's amount after the re-split. */
  newAmountMinor: number;
  /** To refund now; 0 when nothing is owed back. */
  refundMinor: number;
}

export interface RebalancePlan {
  steps: RebalanceStep[];
  /** What the booking holds after the refunds. Equals the total unless someone paid less than an equal share. */
  collectedMinor: number;
}

/**
 * Equal split of totalMinor among the paid shares. The odd minor units go to whoever paid
 * most so far (then original players before ringers, then earliest), so nobody is asked
 * for more than they already paid. A share is never raised: if someone paid less than an
 * equal share (a custom split), people who paid more keep the difference, so the total is still
 * collected. `collectedMinor` falls short only if everyone together paid less than the total.
 */
export function planRebalance(totalMinor: number, shares: readonly PaidShare[]): RebalancePlan {
  if (shares.length < 2) {
    return { steps: [], collectedMinor: shares.reduce((sum, share) => sum + share.paidMinor, 0) };
  }
  const ordered = [...shares].sort(
    (a, b) =>
      b.paidMinor - a.paidMinor ||
      Number(a.isRinger) - Number(b.isRinger) ||
      a.createdAt - b.createdAt ||
      a.shareId.localeCompare(b.shareId),
  );
  const base = Math.floor(totalMinor / ordered.length);
  const extra = totalMinor % ordered.length;

  const amounts = ordered.map((share, index) => Math.min(share.paidMinor, base + (index < extra ? 1 : 0)));

  // A ringer who paid exactly the base amount cannot be asked for the odd unit, so it stays
  // with people who paid more than their share (they simply get that much less refunded).
  let shortfall = totalMinor - amounts.reduce((sum, amount) => sum + amount, 0);
  while (shortfall > 0) {
    let moved = false;
    for (let index = 0; index < ordered.length && shortfall > 0; index += 1) {
      if (amounts[index] < ordered[index].paidMinor) {
        amounts[index] += 1;
        shortfall -= 1;
        moved = true;
      }
    }
    if (!moved) break; // everyone has already paid less than their share: nothing more to keep
  }

  const steps = ordered.map((share, index) => ({
    shareId: share.shareId,
    attemptId: share.attemptId,
    newAmountMinor: amounts[index],
    refundMinor: share.paidMinor - amounts[index],
  }));
  return { steps, collectedMinor: amounts.reduce((sum, amount) => sum + amount, 0) };
}

/** What a ringer is asked to pay: an equal share counting everyone who is in so far, plus themselves. */
export function ringerShareMinor(totalMinor: number, playersSoFar: number): number {
  return Math.floor(totalMinor / (playersSoFar + 1));
}
