import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { codeMatches, countryForPhone, generateCode, hashCode, normalizePhone, otpMessage } from './otp';

describe('normalizePhone', () => {
  it('accepts international numbers and ignores spaces and dashes', () => {
    assert.equal(normalizePhone('+974 5550-0010'), '+97455500010');
  });
  it('refuses anything else', () => {
    for (const bad of ['55500010', '00974555', '+0974555000', '+974abc12345', '', '+123']) assert.equal(normalizePhone(bad), null, bad);
  });
});

describe('countryForPhone', () => {
  it('knows the GCC calling codes', () => {
    assert.equal(countryForPhone('+97455500010'), 'QA');
    assert.equal(countryForPhone('+966555000015'), 'SA');
    assert.equal(countryForPhone('+971555000004'), 'AE');
    assert.equal(countryForPhone('+96555500010'), 'KW');
    assert.equal(countryForPhone('+97355500010'), 'BH');
    assert.equal(countryForPhone('+96855500010'), 'OM');
  });
  it('does not know other countries', () => {
    assert.equal(countryForPhone('+447911123456'), null);
  });
});

describe('codes', () => {
  it('are six digits, including leading zeros', () => {
    for (let i = 0; i < 200; i += 1) assert.match(generateCode(), /^[0-9]{6}$/);
  });

  it('match only the right code, phone and secret', () => {
    const hash = hashCode('012345', '+97455500010', 'secret-a');
    assert.equal(codeMatches('012345', '+97455500010', 'secret-a', hash), true);
    assert.equal(codeMatches('012346', '+97455500010', 'secret-a', hash), false);
    assert.equal(codeMatches('012345', '+97455500011', 'secret-a', hash), false);
    assert.equal(codeMatches('012345', '+97455500010', 'secret-b', hash), false);
  });

  it('never match a malformed stored hash', () => {
    assert.equal(codeMatches('012345', '+97455500010', 'secret-a', 'nothex'), false);
    assert.equal(codeMatches('012345', '+97455500010', 'secret-a', ''), false);
  });

  it('are not shown in the hash', () => {
    assert.ok(!hashCode('123456', '+97455500010', 's').includes('123456'));
  });
});

describe('otpMessage', () => {
  it('carries the code and a warning', () => {
    const text = otpMessage('123456');
    assert.ok(text.includes('123456') && text.includes('Do not share') && text.length <= 160);
  });
});
