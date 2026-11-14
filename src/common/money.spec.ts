import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isCurrencyCode, majorToMinor, minorToMajorNumber, minorToMajorString, platformFeeMinor, slotPriceMinor } from './money';

describe('money', () => {
  it('formats minor units with the currency’s decimals', () => {
    assert.equal(minorToMajorString(25000, 'QAR'), '250.00');
    assert.equal(minorToMajorString(5, 'SAR'), '0.05');
    assert.equal(minorToMajorString(30000, 'BHD'), '30.000');
    assert.equal(minorToMajorString(1, 'OMR'), '0.001');
    assert.equal(minorToMajorString(-1250, 'AED'), '-12.50');
  });

  it('converts to the decimal number a provider expects', () => {
    assert.equal(minorToMajorNumber(8334, 'QAR'), 83.34);
    assert.equal(minorToMajorNumber(27500, 'OMR'), 27.5);
  });

  it('converts provider decimals back without float drift', () => {
    assert.equal(majorToMinor(19.99, 'QAR'), 1999);       // 19.99 * 100 = 1998.9999999999998
    assert.equal(majorToMinor(0.07, 'SAR'), 7);
    assert.equal(majorToMinor('30.125', 'BHD'), 30125);
    assert.equal(majorToMinor(250, 'AED'), 25000);
    assert.throws(() => majorToMinor(Number.NaN, 'QAR'), RangeError);
  });

  it('round-trips every amount up to 100.00', () => {
    for (let minor = 0; minor <= 10_000; minor += 1) {
      assert.equal(majorToMinor(minorToMajorNumber(minor, 'QAR'), 'QAR'), minor);
    }
  });

  it('prices a slot pro rata', () => {
    assert.equal(slotPriceMinor(25000, 60), 25000);
    assert.equal(slotPriceMinor(20000, 90), 30000);
    assert.equal(slotPriceMinor(25000, 30), 12500);
    assert.equal(slotPriceMinor(10001, 30), 5001);        // 5000.5 rounds up
    assert.throws(() => slotPriceMinor(25000, 0), RangeError);
    assert.throws(() => slotPriceMinor(25000, 45.5), RangeError);
  });

  it('takes the platform commission in basis points', () => {
    assert.equal(platformFeeMinor(25000, 1000), 2500);    // 10 % of QAR 250.00
    assert.equal(platformFeeMinor(30000, 1200), 3600);    // 12 %
    assert.equal(platformFeeMinor(999, 1000), 100);       // 99.9 rounds to 100
    assert.equal(platformFeeMinor(25000, 0), 0);
    assert.throws(() => platformFeeMinor(25000, 10_001), RangeError);
  });

  it('recognises only the supported GCC currencies', () => {
    for (const code of ['QAR', 'SAR', 'AED', 'BHD', 'OMR']) assert.equal(isCurrencyCode(code), true);
    assert.equal(isCurrencyCode('USD'), false);
    assert.equal(isCurrencyCode('toString'), false);
    assert.equal(isCurrencyCode(undefined), false);
  });
});
