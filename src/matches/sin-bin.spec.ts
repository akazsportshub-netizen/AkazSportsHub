import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MATCH_EVENT_TYPES, requiresTeamSide, scoreFromEvents, SIN_BIN_SECONDS, sinBinReleaseAt, sinBinSecondsRemaining } from './sin-bin';

describe('White Card sin bin', () => {
  const shownAt = new Date('2026-11-20T18:05:30+03:00');

  it('lasts two minutes', () => {
    assert.equal(SIN_BIN_SECONDS, 120);
  });

  it('releases the player two minutes after the card was shown', () => {
    assert.equal(sinBinReleaseAt('WHITE_CARD', shownAt)?.toISOString(), '2026-11-20T15:07:30.000Z');
  });

  it('applies to no other event', () => {
    for (const type of MATCH_EVENT_TYPES) {
      if (type === 'WHITE_CARD') continue;
      assert.equal(sinBinReleaseAt(type, shownAt), null, type);
    }
  });

  it('does not mutate the event time', () => {
    const before = shownAt.getTime();
    sinBinReleaseAt('WHITE_CARD', shownAt);
    assert.equal(shownAt.getTime(), before);
  });

  it('counts down in whole seconds and stops at zero', () => {
    const release = sinBinReleaseAt('WHITE_CARD', shownAt) as Date;
    const at = (iso: string) => sinBinSecondsRemaining(release, new Date(iso));
    assert.equal(at('2026-11-20T18:05:30+03:00'), 120);
    assert.equal(at('2026-11-20T18:06:30+03:00'), 60);
    assert.equal(at('2026-11-20T18:07:29.400+03:00'), 1);
    assert.equal(at('2026-11-20T18:07:30+03:00'), 0);
    assert.equal(at('2026-11-20T19:00:00+03:00'), 0);
  });
});

describe('match events', () => {
  it('needs a team for everything except match and period markers', () => {
    assert.equal(requiresTeamSide('GOAL'), true);
    assert.equal(requiresTeamSide('WHITE_CARD'), true);
    assert.equal(requiresTeamSide('SUBSTITUTION'), true);
    assert.equal(requiresTeamSide('MATCH_START'), false);
    assert.equal(requiresTeamSide('PERIOD_END'), false);
  });

  it('derives the score, crediting own goals to the other side', () => {
    assert.deepEqual(
      scoreFromEvents([
        { type: 'MATCH_START', teamSide: null },
        { type: 'GOAL', teamSide: 'HOME' },
        { type: 'GOAL', teamSide: 'HOME' },
        { type: 'GOAL', teamSide: 'AWAY' },
        { type: 'OWN_GOAL', teamSide: 'HOME' },
        { type: 'YELLOW_CARD', teamSide: 'AWAY' },
        { type: 'WHITE_CARD', teamSide: 'HOME' },
      ]),
      { home: 2, away: 2 },
    );
    assert.deepEqual(scoreFromEvents([]), { home: 0, away: 0 });
  });

  it('gives the same score whatever order events were synced in', () => {
    const events = [
      { type: 'GOAL' as const, teamSide: 'AWAY' as const },
      { type: 'OWN_GOAL' as const, teamSide: 'AWAY' as const },
      { type: 'GOAL' as const, teamSide: 'HOME' as const },
    ];
    assert.deepEqual(scoreFromEvents(events), scoreFromEvents([...events].reverse()));
  });
});
