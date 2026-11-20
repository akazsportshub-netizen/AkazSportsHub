import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UnifonicMessenger, unifonicRecipient, unifonicSettingsFromEnv } from './unifonic';

const settings = { appSid: 'app1', senderId: 'AKAZ', username: 'u', password: 'p' };

function fakeFetch(status: number, payload: unknown, seen: { init?: RequestInit } = {}) {
  return (async (_url: string, init?: RequestInit) => {
    seen.init = init;
    return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
}

describe('unifonicRecipient', () => {
  it('drops + and spaces', () => assert.equal(unifonicRecipient('+974 5550 0010'), '97455500010'));
});

describe('unifonicSettingsFromEnv', () => {
  it('is null when not configured', () => assert.equal(unifonicSettingsFromEnv({}), null));
  it('names what is missing', () => {
    assert.throws(() => unifonicSettingsFromEnv({ UNIFONIC_APP_SID: 'x' }), /UNIFONIC_SENDER_ID.*UNIFONIC_USERNAME.*UNIFONIC_PASSWORD/);
  });
});

describe('UnifonicMessenger', () => {
  it('posts the message and returns the provider id', async () => {
    const seen: { init?: RequestInit } = {};
    const m = new UnifonicMessenger(settings, fakeFetch(200, { success: true, data: { MessageID: 77 } }, seen));
    const result = await m.send('+97455500010', 'رمز 123456', 'SMS');
    assert.deepEqual(result, { providerMessageId: '77' });
    const body = new URLSearchParams(String(seen.init?.body));
    assert.equal(body.get('Recipient'), '97455500010');
    assert.equal(body.get('SenderID'), 'AKAZ');
    assert.equal(body.get('Body'), 'رمز 123456');
    assert.match(String((seen.init?.headers as Record<string, string>).Authorization), /^Basic /);
  });

  it('throws when the provider says no, without leaking the message', async () => {
    const m = new UnifonicMessenger(settings, fakeFetch(200, { success: false, message: 'bad sender', errorCode: 'ER-1' }));
    await assert.rejects(m.send('+97455500010', 'secret 123456', 'SMS'), (e: Error) => /bad sender/.test(e.message) && !/123456/.test(e.message));
  });

  it('throws on HTTP errors', async () => {
    const m = new UnifonicMessenger(settings, fakeFetch(401, 'nope'));
    await assert.rejects(m.send('+97455500010', 'hi', 'SMS'), /HTTP 401/);
  });

  it('throws when the network fails', async () => {
    const m = new UnifonicMessenger(settings, (async () => { throw new Error('down'); }) as unknown as typeof fetch);
    await assert.rejects(m.send('+97455500010', 'hi', 'SMS'), /request failed: down/);
  });
});
