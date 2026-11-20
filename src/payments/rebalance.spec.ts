import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaidShare, planRebalance, ringerShareMinor } from './rebalance';

const share = (id: string, paidMinor: number, isRinger = false, createdAt = 0): PaidShare => ({
  shareId: id,
  attemptId: `a-${id}`,
  paidMinor,
  isRinger,
  createdAt,
});

const byId = (steps: ReturnType<typeof planRebalance>['steps']) => Object.fromEntries(steps.map((s) => [s.shareId, s]));

describe('ringerShareMinor', () => {
  it('is an equal share counting the ringer', () => {
    assert.equal(ringerShareMinor(10000, 3), 2500);
    assert.equal(ringerShareMinor(10000, 2), 3333);
  });
});

describe('planRebalance', () => {
  it('refunds the difference when one ringer joins an equal split', () => {
    const plan = planRebalance(10000, [share('a', 5000, false, 1), share('b', 5000, false, 2), share('r', 3333, true, 3)]);
    // 3 players: 3334 / 3333 / 3333 — the first original payer keeps the odd unit.
    const s = byId(plan.steps);
    assert.equal(s.a.refundMinor, 5000 - 3334);
    assert.equal(s.b.refundMinor, 5000 - 3333);
    assert.equal(s.r.refundMinor, 0);
    assert.equal(plan.collectedMinor, 10000);
  });

  it('always collects exactly the total after refunds', () => {
    for (const n of [2, 3, 4, 5, 7, 11]) {
      for (const total of [10000, 10001, 12345, 99999]) {
        const originals = [share('o1', Math.ceil(total / 2), false, 1), share('o2', Math.floor(total / 2), false, 2)];
        const ringers = Array.from({ length: n - 2 }, (_, i) => share(`r${i}`, Math.floor(total / n), true, 10 + i));
        const plan = planRebalance(total, [...originals, ...ringers]);
        assert.equal(plan.collectedMinor, total, `n=${n} total=${total}`);
        assert.ok(plan.steps.every((s) => s.refundMinor >= 0 && s.newAmountMinor > 0));
      }
    }
  });

  it('handles a second ringer paying later: refunds shrink the earlier ringer too', () => {
    // A paid 5000, B 5000 → first ringer R1 joined at 3333, then R2 joined at 3333 too.
    const first = planRebalance(10000, [share('a', 5000, false, 1), share('b', 5000, false, 2), share('r1', 3333, true, 3)]);
    const s1 = byId(first.steps);
    const afterFirst = [
      share('a', s1.a.newAmountMinor, false, 1),
      share('b', s1.b.newAmountMinor, false, 2),
      share('r1', s1.r1.newAmountMinor, true, 3),
      share('r2', 3333, true, 4),
    ];
    const second = planRebalance(10000, afterFirst);
    assert.equal(second.collectedMinor, 10000);
    // 4 players: 2500 each. Everyone but the second ringer is refunded down to it.
    assert.ok(second.steps.every((s) => s.newAmountMinor <= 2500 + 1));
    assert.equal(byId(second.steps).r2.refundMinor, 3333 - byId(second.steps).r2.newAmountMinor);
  });

  it('is a no-op once the shares are already equal', () => {
    const plan = planRebalance(9000, [share('a', 3000), share('b', 3000), share('r', 3000, true)]);
    assert.ok(plan.steps.every((s) => s.refundMinor === 0));
    assert.equal(plan.collectedMinor, 9000);
  });

  it('never raises a share; people who paid more keep the difference after a custom split', () => {
    const plan = planRebalance(10000, [share('a', 7000), share('b', 1000), share('r', 2000, true)]);
    const s = byId(plan.steps);
    assert.equal(s.b.newAmountMinor, 1000);
    assert.equal(s.r.newAmountMinor, 2000);
    assert.equal(s.a.refundMinor, 0);
    assert.equal(plan.collectedMinor, 10000);
  });

  it('reports a shortfall only when everyone together paid less than the total', () => {
    const plan = planRebalance(10000, [share('a', 4000), share('b', 3000), share('r', 2000, true)]);
    assert.ok(plan.collectedMinor < 10000);
    assert.ok(plan.steps.every((s) => s.refundMinor === 0));
  });

  it('does nothing with fewer than two payers', () => {
    assert.deepEqual(planRebalance(10000, [share('a', 10000)]).steps, []);
    assert.deepEqual(planRebalance(10000, []).steps, []);
  });
});
