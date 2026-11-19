import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasNextWave, inviteBudget, RINGER_INVITES_PER_SLOT, RINGER_WAVES, ringerWave } from './ringer-waves';

describe('ringer recruitment waves', () => {
  it('starts close and tight', () => {
    assert.deepEqual(ringerWave(0), { radiusKm: 5, eloGap: 100 });
  });

  it('widens with every wave', () => {
    for (let wave = 1; wave < RINGER_WAVES.length; wave += 1) {
      assert.ok(RINGER_WAVES[wave].radiusKm > RINGER_WAVES[wave - 1].radiusKm);
      assert.ok(RINGER_WAVES[wave].eloGap > RINGER_WAVES[wave - 1].eloGap);
    }
  });

  it('ends after the last wave', () => {
    const last = RINGER_WAVES.length - 1;
    assert.notEqual(ringerWave(last), null);
    assert.equal(ringerWave(last + 1), null);
    assert.equal(hasNextWave(last - 1), true);
    assert.equal(hasNextWave(last), false);
  });

  it('rejects nonsense wave numbers', () => {
    assert.equal(ringerWave(-1), null);
    assert.equal(ringerWave(1.5), null);
    assert.equal(ringerWave(Number.NaN), null);
  });

  it('invites a few players per open place and none when full', () => {
    assert.equal(inviteBudget(2, 0), 2 * RINGER_INVITES_PER_SLOT);
    assert.equal(inviteBudget(3, 2), RINGER_INVITES_PER_SLOT);
    assert.equal(inviteBudget(2, 2), 0);
    assert.equal(inviteBudget(2, 5), 0);
  });
});
