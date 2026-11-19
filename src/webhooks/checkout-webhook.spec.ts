import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { computeCheckoutSignature, normalizeCheckoutEvent, verifyCheckoutSignature } from './checkout-webhook';

const SECRET = 'whsec_example';
const ATTEMPT_ID = '7b1e6f0a-52c4-4f3e-9b7d-2f6a1c3d4e5f';

const envelope = (type: string, data: Record<string, unknown> = {}) => ({
  id: 'evt_az5sblvku4ge3dwpztvyizgcau',
  type,
  version: '1.0.33',
  created_on: '2026-11-14T10:36:26.0834077Z',
  data: {
    id: 'pay_mbabizu24mvu3mela5njyhpit4',
    action_id: 'act_y3oqhf46pyzuxjbcn2giaqnb44',
    amount: 8334,
    currency: 'QAR',
    reference: ATTEMPT_ID,
    metadata: { attempt_id: ATTEMPT_ID },
    customer: { id: 'cus_1' },
    ...data,
  },
});

const raw = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8');

describe('Checkout.com signature', () => {
  it('is HMAC-SHA256 of the raw body, hex encoded', () => {
    const body = raw(envelope('payment_approved'));
    assert.equal(computeCheckoutSignature(body, SECRET), createHmac('sha256', SECRET).update(body).digest('hex'));
  });

  it('accepts a correctly signed body', () => {
    const body = raw(envelope('payment_approved'));
    const signature = computeCheckoutSignature(body, SECRET);
    assert.equal(verifyCheckoutSignature(body, signature, SECRET), true);
    assert.equal(verifyCheckoutSignature(body, signature.toUpperCase(), SECRET), true);
  });

  it('rejects a body that changed by a single byte', () => {
    const body = raw(envelope('payment_approved'));
    const signature = computeCheckoutSignature(body, SECRET);
    const tampered = Buffer.from(body.toString('utf8').replace('8334', '8335'), 'utf8');
    assert.equal(verifyCheckoutSignature(tampered, signature, SECRET), false);
  });

  it('is sensitive to re-serialisation, which is why the raw bytes are used', () => {
    const pretty = Buffer.from(JSON.stringify(envelope('payment_approved'), null, 2), 'utf8');
    const compact = raw(envelope('payment_approved'));
    assert.equal(verifyCheckoutSignature(compact, computeCheckoutSignature(pretty, SECRET), SECRET), false);
  });

  it('rejects a wrong key, a missing header and a missing body', () => {
    const body = raw(envelope('payment_approved'));
    assert.equal(verifyCheckoutSignature(body, computeCheckoutSignature(body, 'other'), SECRET), false);
    assert.equal(verifyCheckoutSignature(body, undefined, SECRET), false);
    assert.equal(verifyCheckoutSignature(body, 'abc', SECRET), false);
    assert.equal(verifyCheckoutSignature(undefined, 'abc', SECRET), false);
    assert.equal(verifyCheckoutSignature(body, computeCheckoutSignature(body, SECRET), ''), false);
  });
});

describe('normalizeCheckoutEvent', () => {
  it('maps an approved payment to an authorization', () => {
    const event = normalizeCheckoutEvent(envelope('payment_approved'));
    assert.equal(event.provider, 'checkout');
    assert.equal(event.kind, 'AUTHORIZED');
    assert.equal(event.eventKey, 'evt_az5sblvku4ge3dwpztvyizgcau');
    assert.equal(event.attemptId, ATTEMPT_ID);
    assert.equal(event.providerPaymentId, 'pay_mbabizu24mvu3mela5njyhpit4');
    assert.equal(event.amountMinor, 8334);
    assert.equal(event.currency, 'QAR');
  });

  it('maps the rest of the payment lifecycle', () => {
    const kind = (type: string) => normalizeCheckoutEvent(envelope(type)).kind;
    assert.equal(kind('payment_captured'), 'CAPTURED');
    assert.equal(kind('payment_declined'), 'FAILED');
    assert.equal(kind('payment_expired'), 'FAILED');
    assert.equal(kind('payment_canceled'), 'FAILED');
    assert.equal(kind('payment_voided'), 'VOIDED');
    assert.equal(kind('payment_refunded'), 'REFUNDED');
    assert.equal(kind('payment_capture_declined'), 'ACTION_FAILED');
    assert.equal(kind('payment_void_declined'), 'ACTION_FAILED');
    assert.equal(kind('payment_refund_declined'), 'ACTION_FAILED');
  });

  it('stores but does not act on events it does not know', () => {
    assert.equal(normalizeCheckoutEvent(envelope('dispute_received')).kind, null);
    assert.equal(normalizeCheckoutEvent(envelope('payment_pending')).kind, null);
  });

  it('falls back to `reference` when metadata is missing', () => {
    assert.equal(normalizeCheckoutEvent(envelope('payment_approved', { metadata: undefined })).attemptId, ATTEMPT_ID);
  });

  it('ignores a reference that is not a uuid', () => {
    const event = normalizeCheckoutEvent(envelope('payment_approved', { metadata: {}, reference: 'ORD-5023-4E89' }));
    assert.equal(event.attemptId, null);
    assert.equal(event.providerPaymentId, 'pay_mbabizu24mvu3mela5njyhpit4');
  });

  it('does not act on an event without a payment id', () => {
    assert.equal(normalizeCheckoutEvent({ id: 'evt_1', type: 'payment_approved', data: {} }).kind, null);
  });

  it('refuses a non-integer amount instead of rounding it', () => {
    assert.equal(normalizeCheckoutEvent(envelope('payment_approved', { amount: 83.34 })).amountMinor, null);
  });
});
