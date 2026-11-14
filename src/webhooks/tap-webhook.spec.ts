import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { computeTapHashstring, normalizeTapEvent, tapHashInput, verifyTapHashstring } from './tap-webhook';

const SECRET = 'sk_test_example_secret';
const ATTEMPT_ID = '7b1e6f0a-52c4-4f3e-9b7d-2f6a1c3d4e5f';

/** Shaped like Tap's documented charge notification. */
const charge = () => ({
  id: 'chg_TS05A4120230736x9K22710693',
  object: 'charge',
  status: 'CAPTURED',
  amount: 83.34,
  currency: 'QAR',
  transaction: { created: '1698392202943', timezone: 'UTC+03:00' },
  reference: { track: 'tck_1', payment: '4327230736106619650', gateway: 'naps_pg709', transaction: ATTEMPT_ID },
  customer: { id: 'cus_TS01A1', first_name: 'Demo' },
  metadata: { attempt_id: ATTEMPT_ID, booking_id: 'b', share_id: 's' },
});

const sign = (body: Record<string, unknown>) => computeTapHashstring(body, SECRET) as string;

describe('Tap hashstring', () => {
  it('builds the documented field string', () => {
    assert.equal(
      tapHashInput(charge()),
      'x_idchg_TS05A4120230736x9K22710693x_amount83.34x_currencyQARx_gateway_referencenaps_pg709' +
        'x_payment_reference4327230736106619650x_statusCAPTUREDx_created1698392202943',
    );
  });

  it('is HMAC-SHA256 of that string, hex encoded', () => {
    const body = charge();
    const expected = createHmac('sha256', SECRET).update(tapHashInput(body) as string).digest('hex');
    assert.equal(sign(body), expected);
    assert.match(expected, /^[0-9a-f]{64}$/);
  });

  it('renders the amount with the currency’s decimals', () => {
    assert.match(tapHashInput({ ...charge(), amount: 1, currency: 'SAR' }) as string, /x_amount1\.00x_currencySAR/);
    assert.match(tapHashInput({ ...charge(), amount: 30, currency: 'BHD' }) as string, /x_amount30\.000x_currencyBHD/);
    assert.match(tapHashInput({ ...charge(), amount: 27.5, currency: 'OMR' }) as string, /x_amount27\.500x_currencyOMR/);
  });

  it('uses an empty gateway reference when Tap sends none', () => {
    const body = { ...charge(), reference: { payment: '123' } };
    assert.match(tapHashInput(body) as string, /x_gateway_referencex_payment_reference123x_status/);
  });

  it('reads `created` from the top level for refunds', () => {
    const refund = { id: 're_1', object: 'refund', status: 'REFUNDED', amount: 83.34, currency: 'QAR', created: '1698392999000', charge_id: 'chg_1', reference: {} };
    assert.match(tapHashInput(refund) as string, /x_created1698392999000$/);
  });

  it('accepts a correctly signed notification', () => {
    const body = charge();
    assert.equal(verifyTapHashstring(body, sign(body), SECRET), true);
    assert.equal(verifyTapHashstring(body, sign(body).toUpperCase(), SECRET), true);
  });

  it('rejects a tampered amount, status or id', () => {
    const signature = sign(charge());
    assert.equal(verifyTapHashstring({ ...charge(), amount: 0.01 }, signature, SECRET), false);
    assert.equal(verifyTapHashstring({ ...charge(), status: 'FAILED' }, signature, SECRET), false);
    assert.equal(verifyTapHashstring({ ...charge(), id: 'chg_other' }, signature, SECRET), false);
  });

  it('rejects a wrong key, a missing header and an unsignable body', () => {
    const body = charge();
    assert.equal(verifyTapHashstring(body, computeTapHashstring(body, 'sk_other') as string, SECRET), false);
    assert.equal(verifyTapHashstring(body, undefined, SECRET), false);
    assert.equal(verifyTapHashstring(body, '', SECRET), false);
    assert.equal(verifyTapHashstring(body, 'deadbeef', SECRET), false);
    assert.equal(verifyTapHashstring({ object: 'charge' }, 'deadbeef', SECRET), false);
    assert.equal(verifyTapHashstring(body, sign(body), ''), false);
  });
});

describe('normalizeTapEvent', () => {
  it('maps a captured charge', () => {
    const event = normalizeTapEvent(charge());
    assert.equal(event.provider, 'tap');
    assert.equal(event.kind, 'CAPTURED');
    assert.equal(event.eventKey, 'chg_TS05A4120230736x9K22710693:CAPTURED');
    assert.equal(event.attemptId, ATTEMPT_ID);
    assert.equal(event.providerPaymentId, 'chg_TS05A4120230736x9K22710693');
    assert.equal(event.providerCustomerId, 'cus_TS01A1');
    assert.equal(event.amountMinor, 8334);
    assert.equal(event.currency, 'QAR');
  });

  it('converts three-decimal currencies to minor units', () => {
    assert.equal(normalizeTapEvent({ ...charge(), amount: 30.125, currency: 'BHD' }).amountMinor, 30125);
    assert.equal(normalizeTapEvent({ ...charge(), amount: 22, currency: 'OMR' }).amountMinor, 22000);
  });

  it('maps authorization statuses', () => {
    const authorize = (status: string) => normalizeTapEvent({ ...charge(), id: 'auth_1', object: 'authorize', status });
    assert.equal(authorize('AUTHORIZED').kind, 'AUTHORIZED');
    assert.equal(authorize('VOID').kind, 'VOIDED');
    assert.equal(authorize('CAPTURED').kind, 'CAPTURED');
    assert.equal(authorize('DECLINED').kind, 'FAILED');
    assert.equal(authorize('INITIATED').kind, null);
  });

  it('maps failed and in-progress charges', () => {
    for (const status of ['ABANDONED', 'CANCELLED', 'FAILED', 'DECLINED', 'RESTRICTED', 'TIMEDOUT']) {
      assert.equal(normalizeTapEvent({ ...charge(), status }).kind, 'FAILED', status);
    }
    assert.equal(normalizeTapEvent({ ...charge(), status: 'INITIATED' }).kind, null);
    assert.equal(normalizeTapEvent({ ...charge(), status: 'UNKNOWN' }).kind, null);
  });

  it('points a refund at the charge it refunds', () => {
    const event = normalizeTapEvent({
      id: 're_1', object: 'refund', status: 'REFUNDED', amount: 83.34, currency: 'QAR', created: '1',
      charge_id: 'chg_9', metadata: { attempt_id: ATTEMPT_ID },
    });
    assert.equal(event.kind, 'REFUNDED');
    assert.equal(event.providerPaymentId, 'chg_9');
    assert.equal(event.providerRefundId, 're_1');
    assert.equal(event.eventKey, 're_1:REFUNDED');
  });

  it('flags a failed refund for review', () => {
    assert.equal(normalizeTapEvent({ id: 're_1', object: 'refund', status: 'FAILED', amount: 1, currency: 'QAR', charge_id: 'chg_9' }).kind, 'ACTION_FAILED');
  });

  it('ignores an attempt reference that is not a uuid', () => {
    assert.equal(normalizeTapEvent({ ...charge(), metadata: { attempt_id: "1' OR '1'='1" } }).attemptId, null);
    assert.equal(normalizeTapEvent({ ...charge(), metadata: undefined }).attemptId, null);
  });

  it('gives a distinct key to each status of the same object', () => {
    const initiated = normalizeTapEvent({ ...charge(), status: 'INITIATED' });
    const captured = normalizeTapEvent(charge());
    assert.notEqual(initiated.eventKey, captured.eventKey);
  });
});
