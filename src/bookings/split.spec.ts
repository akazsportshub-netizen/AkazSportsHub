import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateShares, MAX_SHARES, ShareInput, SplitError, SplitErrorCode } from './split';

const payers = (count: number): ShareInput[] =>
  Array.from({ length: count }, (_unused, index) => ({ userId: `00000000-0000-4000-a000-${String(index).padStart(12, '0')}` }));

const sum = (amounts: { amountMinor: number }[]) => amounts.reduce((total, share) => total + share.amountMinor, 0);

function assertSplitError(run: () => unknown, code: SplitErrorCode): void {
  assert.throws(run, (error: unknown) => error instanceof SplitError && error.code === code);
}

describe('allocateShares', () => {
  it('splits evenly when the total divides', () => {
    const shares = allocateShares(25000, payers(10));
    assert.deepEqual(shares.map((share) => share.amountMinor), Array(10).fill(2500));
  });

  it('gives the indivisible remainder to the first payers, one minor unit each', () => {
    const shares = allocateShares(25000, payers(3));
    assert.deepEqual(shares.map((share) => share.amountMinor), [8334, 8333, 8333]);

    const seven = allocateShares(10000, payers(7));
    assert.deepEqual(seven.map((share) => share.amountMinor), [1429, 1429, 1429, 1429, 1428, 1428, 1428]);
  });

  it('always adds up to exactly the total', () => {
    for (const total of [1, 22, 999, 25000, 30125, 35001, 4200000]) {
      for (let count = 1; count <= MAX_SHARES; count += 1) {
        if (total < count) continue;
        const shares = allocateShares(total, payers(count));
        assert.equal(sum(shares), total, `total ${total} split ${count} ways`);
        const amounts = shares.map((share) => share.amountMinor);
        assert.ok(Math.max(...amounts) - Math.min(...amounts) <= 1, 'equal shares differ by at most one minor unit');
      }
    }
  });

  it('charges a single payer the whole amount', () => {
    assert.deepEqual(allocateShares(25000, payers(1)), [{ userId: payers(1)[0].userId, amountMinor: 25000 }]);
  });

  it('keeps the order of the payers', () => {
    const input = payers(4);
    assert.deepEqual(allocateShares(1000, input).map((share) => share.userId), input.map((payer) => payer.userId));
  });

  it('accepts a custom split that adds up', () => {
    const [a, b, c] = payers(3);
    const shares = allocateShares(25000, [
      { ...a, amountMinor: 15000 },
      { ...b, amountMinor: 5000 },
      { ...c, amountMinor: 5000 },
    ]);
    assert.deepEqual(shares.map((share) => share.amountMinor), [15000, 5000, 5000]);
  });

  it('rejects a custom split that does not add up', () => {
    const [a, b] = payers(2);
    assertSplitError(() => allocateShares(25000, [{ ...a, amountMinor: 15000 }, { ...b, amountMinor: 9999 }]), 'SHARES_DO_NOT_ADD_UP');
    assertSplitError(() => allocateShares(25000, [{ ...a, amountMinor: 15000 }, { ...b, amountMinor: 10001 }]), 'SHARES_DO_NOT_ADD_UP');
  });

  it('rejects amounts on only some payers', () => {
    const [a, b] = payers(2);
    assertSplitError(() => allocateShares(25000, [{ ...a, amountMinor: 25000 }, b]), 'MIXED_SPLIT');
  });

  it('rejects zero, negative and fractional shares', () => {
    const [a, b] = payers(2);
    assertSplitError(() => allocateShares(25000, [{ ...a, amountMinor: 25000 }, { ...b, amountMinor: 0 }]), 'INVALID_SHARE_AMOUNT');
    assertSplitError(() => allocateShares(25000, [{ ...a, amountMinor: 25001 }, { ...b, amountMinor: -1 }]), 'INVALID_SHARE_AMOUNT');
    assertSplitError(() => allocateShares(25000, [{ ...a, amountMinor: 12500.5 }, { ...b, amountMinor: 12499.5 }]), 'INVALID_SHARE_AMOUNT');
  });

  it('rejects the same payer twice, whatever the letter case', () => {
    const id = 'ABCDEF00-0000-4000-A000-000000000001';
    assertSplitError(() => allocateShares(25000, [{ userId: id }, { userId: id.toLowerCase() }]), 'DUPLICATE_PAYER');
  });

  it('rejects empty, oversized and impossible splits', () => {
    assertSplitError(() => allocateShares(25000, []), 'NO_SHARES');
    assertSplitError(() => allocateShares(25000, payers(MAX_SHARES + 1)), 'TOO_MANY_SHARES');
    assertSplitError(() => allocateShares(3, payers(5)), 'TOTAL_TOO_SMALL_TO_SPLIT');
    assertSplitError(() => allocateShares(0, payers(2)), 'INVALID_TOTAL');
    assertSplitError(() => allocateShares(100.5, payers(2)), 'INVALID_TOTAL');
  });
});
