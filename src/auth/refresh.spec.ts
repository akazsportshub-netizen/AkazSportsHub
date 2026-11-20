import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideRefresh, generateRefreshToken, hashRefreshToken } from './refresh';

const now = new Date('2026-11-20T12:00:00Z');
const later = new Date('2026-12-20T12:00:00Z');

describe('refresh tokens', () => {
  it('generates long unique tokens and hashes them stably', () => {
    const a = generateRefreshToken();
    assert.ok(a.length >= 43);
    assert.notEqual(a, generateRefreshToken());
    assert.equal(hashRefreshToken(a), hashRefreshToken(a));
    assert.notEqual(hashRefreshToken(a), a);
  });

  it('accepts a live, unused token', () => {
    assert.equal(decideRefresh({ expires_at: later, rotated_at: null, revoked_at: null }, now), 'ok');
  });

  it('refuses expired and revoked tokens', () => {
    assert.equal(decideRefresh({ expires_at: now, rotated_at: null, revoked_at: null }, now), 'invalid');
    assert.equal(decideRefresh({ expires_at: later, rotated_at: null, revoked_at: now }, now), 'invalid');
  });

  it('treats a token used moments ago as a retry, and an old used token as theft', () => {
    const justNow = new Date(now.getTime() - 5_000);
    const earlier = new Date(now.getTime() - 60_000);
    assert.equal(decideRefresh({ expires_at: later, rotated_at: justNow, revoked_at: null }, now), 'reused_recently');
    assert.equal(decideRefresh({ expires_at: later, rotated_at: earlier, revoked_at: null }, now), 'reused');
  });
});
