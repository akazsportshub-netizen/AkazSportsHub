import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MessageKind, MessageVars, formatWhen, renderMessage, toLocale } from './templates';

const vars: MessageVars = {
  who: 'Omar',
  court: 'Court 1',
  venue: 'Doha Padel',
  startsAt: '2026-11-21T16:00:00Z',
  timezone: 'Asia/Qatar',
  amountMinor: 8333,
  currency: 'QAR',
  holdMinutes: 15,
  sport: 'PADEL',
};
const KINDS: MessageKind[] = ['SHARE_INVITE', 'RINGER_INVITE', 'RINGER_JOINED', 'SHARE_REFUND'];

describe('renderMessage (English)', () => {
  it('tells a friend who added them, where, when and what to pay', () => {
    const text = renderMessage('SHARE_INVITE', vars);
    for (const part of ['Omar', 'Court 1, Doha Padel', '7:00', 'QAR 83.33', '15 minutes']) assert.ok(text.includes(part), part);
  });

  it('names the sport in words, not as a database value', () => {
    const text = renderMessage('RINGER_INVITE', vars);
    assert.ok(text.includes('a padel near you') && !text.includes('PADEL'), text);
  });

  it('tells the organizer who joined and tells payers about their refund', () => {
    assert.ok(renderMessage('RINGER_JOINED', vars).includes('Omar joined'));
    assert.ok(renderMessage('SHARE_REFUND', vars).includes('QAR 83.33 is being refunded'));
  });
});

describe('renderMessage (Arabic)', () => {
  it('is written in Arabic and still carries the facts', () => {
    for (const kind of KINDS) {
      const text = renderMessage(kind, vars, 'ar');
      assert.match(text, /[؀-ۿ]/, kind);
      assert.ok(text.includes('QAR 83.33') || kind === 'RINGER_JOINED', kind);
      assert.ok(text.includes('Court 1'), kind);
    }
  });

  it('names the sport in Arabic', () => {
    assert.ok(renderMessage('RINGER_INVITE', vars, 'ar').includes('البادل'));
  });

  it('uses Western digits for the time', () => {
    assert.match(renderMessage('SHARE_INVITE', vars, 'ar'), /7:00/);
  });
});

describe('every message', () => {
  it('stays short enough for two SMS segments (Arabic gets fewer characters per segment)', () => {
    for (const kind of KINDS) {
      assert.ok(renderMessage(kind, vars, 'en').length <= 320, `en ${kind}`);
      assert.ok(renderMessage(kind, vars, 'ar').length <= 200, `ar ${kind}`);
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

describe('toLocale', () => {
  it('falls back to English for anything unknown', () => {
    assert.equal(toLocale('ar'), 'ar');
    assert.equal(toLocale('fr'), 'en');
    assert.equal(toLocale(undefined), 'en');
  });
});
