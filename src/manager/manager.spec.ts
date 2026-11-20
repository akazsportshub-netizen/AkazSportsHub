import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blockProblem, netMinor, sumEarnings, touchesSchedule } from './manager';

const now = new Date('2026-11-20T12:00:00Z');
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

describe('blockProblem', () => {
  it('accepts a normal block', () => assert.equal(blockProblem(at(24), at(26), now), null));
  it('refuses an end before the start', () => assert.equal(blockProblem(at(26), at(24), now), 'END_BEFORE_START'));
  it('refuses an empty block', () => assert.equal(blockProblem(at(24), at(24), now), 'END_BEFORE_START'));
  it('refuses a block already over', () => assert.equal(blockProblem(at(-5), at(-2), now), 'IN_THE_PAST'));
  it('accepts a block that has started and is still running', () => assert.equal(blockProblem(at(-1), at(2), now), null));
  it('refuses more than 31 days', () => assert.equal(blockProblem(at(1), at(1 + 32 * 24), now), 'TOO_LONG'));
  it('refuses a block more than a year ahead', () => assert.equal(blockProblem(at(367 * 24), at(367 * 24 + 2), now), 'TOO_FAR_AHEAD'));
});

describe('touchesSchedule', () => {
  it('lets price, name and capacity change freely', () => {
    assert.equal(touchesSchedule({ price_per_hour_minor: 9000, name: 'A', capacity_players: 10 }), false);
  });
  it('guards hours, slot length and switching a court off', () => {
    assert.equal(touchesSchedule({ opens_at: '07:00' }), true);
    assert.equal(touchesSchedule({ slot_minutes: 90 }), true);
    assert.equal(touchesSchedule({ is_active: false }), true);
  });
  it('lets a court be switched back on', () => assert.equal(touchesSchedule({ is_active: true }), false));
});

describe('earnings', () => {
  it('nets out the commission', () => assert.equal(netMinor({ gross_minor: 30000, commission_minor: 3000 }), 27000));
  it('adds the days up', () => {
    const total = sumEarnings([
      { bookings: 2, gross_minor: 20000, commission_minor: 2000 },
      { bookings: 1, gross_minor: 10000, commission_minor: 1000 },
    ]);
    assert.deepEqual(total, { bookings: 3, gross_minor: 30000, commission_minor: 3000, net_minor: 27000 });
  });
  it('is zero with no days', () => assert.equal(sumEarnings([]).net_minor, 0));
});
