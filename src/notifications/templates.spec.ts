import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatWhen, renderMessage } from './templates';

describe('renderMessage', () => {
  const vars = { who: 'Omar', court: 'Court 1', venue: 'Doha Padel', when: 'Sat 21 Nov, 7:00 pm', amountMinor: 8333, currency: 'QAR' as const };

  it('tells a friend who added them, where, when and what to pay', () => {
    const text = renderMessage('SHARE_INVITE', { ...vars, holdMinutes: 15 });
    for (const part of ['Omar', 'Court 1, Doha Padel', 'Sat 21 Nov', 'QAR 83.33', '15 minutes']) assert.ok(text.includes(part), part);
  });

  it('invites a ringer with the sport and the share', () => {
    const text = renderMessage('RINGER_INVITE', { ...vars, sport: 'padel' });
    assert.ok(text.includes('padel') && text.includes('QAR 83.33'));
  });

  it('tells the organizer who joined and tells payers about their refund', () => {
    assert.ok(renderMessage('RINGER_JOINED', vars).includes('Omar joined'));
    assert.ok(renderMessage('SHARE_REFUND', vars).includes('QAR 83.33 is being refunded'));
  });

  it('keeps every message short enough for two SMS segments', () => {
    for (const kind of ['SHARE_INVITE', 'RINGER_INVITE', 'RINGER_JOINED', 'SHARE_REFUND'] as const) {
      assert.ok(renderMessage(kind, { ...vars, holdMinutes: 15, sport: 'padel' }).length <= 320, kind);
    }
  });
});

describe('formatWhen', () => {
  it('uses the venue time zone, not the server one', () => {
    const doha = formatWhen('2026-11-21T16:00:00Z', 'Asia/Qatar');
    const dubai = formatWhen('2026-11-21T16:00:00Z', 'Asia/Dubai');
    assert.ok(doha.includes('7:00') && dubai.includes('8:00'), `${doha} / ${dubai}`);
  });
});
