import { createHmac, timingSafeEqual } from 'node:crypto';
import { isUuid } from '../auth/auth.types';
import { ProviderEvent, ProviderEventKind } from '../payments/payment-events';
import { asRecord, asString } from '../payments/payment-gateway';

/**
 * Checkout.com signs the raw request body with HMAC-SHA256 using the webhook's signature
 * key and sends the hex digest in the `Cko-Signature` header. The digest must be computed
 * over the exact bytes received — re-serialising the JSON would change it.
 */
export function computeCheckoutSignature(rawBody: Buffer, webhookSecret: string): string {
  return createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
}

export function verifyCheckoutSignature(rawBody: Buffer | undefined, received: string | undefined, webhookSecret: string): boolean {
  if (!rawBody || !received || !webhookSecret) return false;
  const a = Buffer.from(computeCheckoutSignature(rawBody, webhookSecret), 'utf8');
  const b = Buffer.from(received.trim().toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const EVENT_KINDS: Record<string, ProviderEventKind> = {
  payment_approved: 'AUTHORIZED',
  payment_captured: 'CAPTURED',
  payment_declined: 'FAILED',
  payment_expired: 'FAILED',
  payment_canceled: 'FAILED',
  payment_authentication_failed: 'FAILED',
  payment_voided: 'VOIDED',
  payment_refunded: 'REFUNDED',
  payment_capture_declined: 'ACTION_FAILED',
  payment_void_declined: 'ACTION_FAILED',
  payment_refund_declined: 'ACTION_FAILED',
};

/**
 * Translates a verified Checkout.com event envelope `{ id, type, data }` into a ProviderEvent.
 * `data.id` is the payment id (`pay_…`), `data.reference` carries our attempt id, and
 * `data.amount` is already in minor units.
 */
export function normalizeCheckoutEvent(envelope: Record<string, unknown>): ProviderEvent {
  const type = asString(envelope.type) ?? 'unknown';
  const eventId = asString(envelope.id);
  const data = asRecord(envelope.data);
  const paymentId = asString(data.id);

  const metadataAttemptId = asRecord(data.metadata).attempt_id;
  const reference = data.reference;
  const attemptId = isUuid(metadataAttemptId) ? metadataAttemptId : isUuid(reference) ? reference : null;

  const amount = typeof data.amount === 'number' && Number.isInteger(data.amount) ? data.amount : null;

  return {
    provider: 'checkout',
    eventKey: eventId ?? `${paymentId ?? 'unknown'}:${type}`,
    eventType: type,
    kind: paymentId ? EVENT_KINDS[type] ?? null : null,
    attemptId: attemptId ? attemptId.toLowerCase() : null,
    providerPaymentId: paymentId,
    providerRefundId: null,
    providerCustomerId: asString(asRecord(data.customer).id),
    amountMinor: amount,
    currency: asString(data.currency),
    payload: envelope,
  };
}
