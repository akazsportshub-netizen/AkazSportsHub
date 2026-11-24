import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emailHashKey, emailOtpMessage, normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => assert.equal(normalizeEmail('  Omar@Example.COM '), 'omar@example.com'));
  it('refuses things that are not addresses', () => {
    for (const bad of ['', 'omar', 'omar@', '@example.com', 'omar@example', 'a b@example.com', 'a@b.c']) {
      assert.equal(normalizeEmail(bad), null, bad);
    }
  });
  it('refuses very long addresses', () => assert.equal(normalizeEmail(`${'a'.repeat(250)}@example.com`), null));
});

describe('emailOtpMessage', () => {
  it('puts the code and the lifetime in both languages', () => {
    const en = emailOtpMessage('123456', 'en');
    const ar = emailOtpMessage('123456', 'ar');
    assert.match(en.text, /123456/);
    assert.match(en.text, /5 minutes/);
    assert.match(ar.text, /123456/);
    assert.match(ar.subject, /AKAZ/);
  });
});

describe('emailHashKey', () => {
  it('is kept apart from phone numbers', () => assert.equal(emailHashKey('a@b.co'), 'email:a@b.co'));
});
