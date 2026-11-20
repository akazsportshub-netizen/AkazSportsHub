import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RateLimiter } from './rate-limit';

describe('RateLimiter', () => {
  it('allows up to the limit, then refuses', () => {
    const limiter = new RateLimiter(3, 60_000, () => 0);
    assert.deepEqual([1, 2, 3, 4].map(() => limiter.allow('a')), [true, true, true, false]);
  });

  it('counts each key separately', () => {
    const limiter = new RateLimiter(1, 60_000, () => 0);
    assert.equal(limiter.allow('a'), true);
    assert.equal(limiter.allow('b'), true);
    assert.equal(limiter.allow('a'), false);
  });

  it('starts a new window after the time is up', () => {
    let now = 0;
    const limiter = new RateLimiter(1, 1000, () => now);
    assert.equal(limiter.allow('a'), true);
    assert.equal(limiter.allow('a'), false);
    now = 1000;
    assert.equal(limiter.allow('a'), true);
  });
});
