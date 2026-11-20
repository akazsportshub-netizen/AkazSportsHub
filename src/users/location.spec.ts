import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coarsen } from './location';

describe('coarsen', () => {
  it('keeps three decimal places', () => {
    assert.equal(coarsen(25.286106), 25.286);
    assert.equal(coarsen(51.534817), 51.535);
    assert.equal(coarsen(-0.0004), -0);
  });
});
