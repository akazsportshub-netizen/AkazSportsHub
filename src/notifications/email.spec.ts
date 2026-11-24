import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ResendEmailSender, resendSettingsFromEnv } from './email';

const settings = { apiKey: 're_test', from: 'AKAZ <noreply@example.com>' };
const fake = (status: number, payload: unknown, seen: { init?: RequestInit } = {}) =>
  (async (_url: string, init?: RequestInit) => {
    seen.init = init;
    return new Response(JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;

describe('resendSettingsFromEnv', () => {
  it('is null when not configured', () => assert.equal(resendSettingsFromEnv({}), null));
  it('needs a sender address', () => assert.throws(() => resendSettingsFromEnv({ RESEND_API_KEY: 'x' }), /EMAIL_FROM/));
});

describe('ResendEmailSender', () => {
  it('posts the email and returns the id', async () => {
    const seen: { init?: RequestInit } = {};
    const sender = new ResendEmailSender(settings, fake(200, { id: 'abc' }, seen));
    assert.deepEqual(await sender.send('omar@example.com', 'Subject', 'Body 123456'), { providerMessageId: 'abc' });
    assert.deepEqual(JSON.parse(String(seen.init?.body)), { from: settings.from, to: 'omar@example.com', subject: 'Subject', text: 'Body 123456' });
    assert.equal((seen.init?.headers as Record<string, string>).Authorization, 'Bearer re_test');
  });

  it('throws when refused, without leaking the code', async () => {
    const sender = new ResendEmailSender(settings, fake(403, { message: 'domain not verified' }));
    await assert.rejects(sender.send('a@b.co', 'S', 'code 123456'), (e: Error) => /domain not verified/.test(e.message) && !/123456/.test(e.message));
  });

  it('throws when the network fails', async () => {
    const sender = new ResendEmailSender(settings, (async () => { throw new Error('down'); }) as unknown as typeof fetch);
    await assert.rejects(sender.send('a@b.co', 'S', 'T'), /request failed: down/);
  });
});
