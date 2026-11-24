import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { balanceTeams } from './balance';
import { computeRatingChanges, expectedScore, kFactor, marginMultiplier } from './elo';

const p = (userId: string, rating = 1200, ratedMatches = 0) => ({ userId, rating, ratedMatches });

describe('expectedScore', () => {
  it('is 50% for equals and favours the stronger side', () => {
    assert.equal(expectedScore(1200, 1200), 0.5);
    assert.ok(expectedScore(1400, 1200) > 0.7);
    assert.ok(Math.abs(expectedScore(1400, 1200) + expectedScore(1200, 1400) - 1) < 1e-12);
  });
});

describe('kFactor and margin', () => {
  it('moves new players faster', () => {
    assert.equal(kFactor(0), 40);
    assert.equal(kFactor(9), 40);
    assert.equal(kFactor(10), 24);
  });
  it('counts bigger wins a little more, capped', () => {
    assert.equal(marginMultiplier(0), 1);
    assert.equal(marginMultiplier(1), 1.1);
    assert.equal(marginMultiplier(-3), 1.3);
    assert.equal(marginMultiplier(20), 1.5);
  });
});

describe('computeRatingChanges', () => {
  it('moves equal teams by the same amount in opposite directions', () => {
    const changes = computeRatingChanges([p('a'), p('b')], [p('c'), p('d')], 1, 0);
    assert.deepEqual(changes.map((c) => c.delta), [22, 22, -22, -22]);
    assert.deepEqual(changes.map((c) => c.after), [1222, 1222, 1178, 1178]);
  });

  it('leaves equal teams unchanged after a draw', () => {
    const changes = computeRatingChanges([p('a')], [p('b')], 2, 2);
    assert.deepEqual(changes.map((c) => c.delta), [0, 0]);
  });

  it('rewards an upset more than an expected win', () => {
    const upset = computeRatingChanges([p('a', 1000)], [p('b', 1400)], 1, 0)[0].delta;
    const expected = computeRatingChanges([p('a', 1400)], [p('b', 1000)], 1, 0)[0].delta;
    assert.ok(upset > expected);
  });

  it('moves established players less than new ones', () => {
    const [fresh, veteran] = computeRatingChanges([p('a', 1200, 0), p('b', 1200, 50)], [p('c'), p('d')], 1, 0);
    assert.ok(fresh.delta > veteran.delta);
  });

  it('keeps ratings inside the allowed range', () => {
    const [top] = computeRatingChanges([p('a', 2999)], [p('b', 100)], 5, 0);
    assert.ok(top.after <= 3000);
    const low = computeRatingChanges([p('a', 100)], [p('b', 2999)], 0, 5)[0];
    assert.ok(low.after >= 100);
  });

  it('does nothing when a side has no players', () => {
    assert.deepEqual(computeRatingChanges([p('a')], [], 1, 0), []);
  });
});

describe('balanceTeams', () => {
  it('splits an even group into equal sizes with equal strength where possible', () => {
    const teams = balanceTeams([p('a', 1500), p('b', 1400), p('c', 1300), p('d', 1200)]);
    assert.equal(teams.home.length, 2);
    assert.equal(teams.away.length, 2);
    const rating = new Map([['a', 1500], ['b', 1400], ['c', 1300], ['d', 1200]]);
    const sum = (ids: string[]) => ids.reduce((s, id) => s + rating.get(id)!, 0);
    assert.equal(sum(teams.home), sum(teams.away));
  });

  it('keeps sizes within one for odd groups and uses everyone once', () => {
    const teams = balanceTeams([p('a', 1500), p('b', 1400), p('c', 1300), p('d', 1200), p('e', 1100)]);
    assert.equal(teams.home.length, 3);
    assert.equal(teams.away.length, 2);
    assert.deepEqual([...teams.home, ...teams.away].sort(), ['a', 'b', 'c', 'd', 'e']);
  });

  it('gives the same answer whatever order the players arrive in', () => {
    const list = [p('a', 1500), p('b', 1400), p('c', 1300), p('d', 1200), p('e', 1250), p('f', 1350)];
    assert.deepEqual(balanceTeams(list), balanceTeams([...list].reverse()));
  });

  it('copes with tiny groups', () => {
    assert.deepEqual(balanceTeams([]), { home: [], away: [] });
    assert.deepEqual(balanceTeams([p('a')]), { home: ['a'], away: [] });
  });

  it('balances a larger group closely', () => {
    const players = Array.from({ length: 14 }, (_, i) => p(`u${String(i).padStart(2, '0')}`, 1000 + i * 37));
    const teams = balanceTeams(players);
    const rating = new Map(players.map((x) => [x.userId, x.rating]));
    const avg = (ids: string[]) => ids.reduce((s, id) => s + rating.get(id)!, 0) / ids.length;
    assert.ok(Math.abs(avg(teams.home) - avg(teams.away)) < 20);
  });
});
