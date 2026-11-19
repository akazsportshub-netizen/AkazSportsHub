import { createHmac, timingSafeEqual } from 'node:crypto';
import { isUuid } from '../auth/auth.types';
import { ProviderEvent, ProviderEventKind } from '../payments/payment-events';
import { asRecord, asString } from '../payments/payment-gateway';

/**
 * Tap signs a webhook with HMAC-SHA256 (key: the merchant's secret API key) over a
 * string assembled from selected fields of the payload, and sends the hex digest in
 * the `hashstring` header. See https://developers.tap.company/docs/webhook
 *
 *   x_id{id}x_amount{amount}x_currency{currency}x_gateway_reference{reference.gateway}
 *   x_payment_reference{reference.payment}x_status{status}x_created{created}
 *
 * `amount` is rendered with the currency's standard number of decimals, and `created`
 * is `transaction.created` for charges and authorizations, `created` for refunds.
 */
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'KWD', 'OMR', 'JOD']);

function decimalsFor(currency: string): number {
  return THREE_DECIMAL_CURRENCIES.has(currency) ? 3 : 2;
}

export function tapHashInput(body: Record<string, unknown>): string | null {
  const id = asString(body.id);
  const currency = asString(body.currency);
  const status = asString(body.status);
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
  const reference = asRecord(body.reference);
  const created = asString(asRecord(body.transaction).created) ?? asString(body.created);
  if (!id || !currency || !status || !created || !Number.isFinite(amount)) return null;

  return (
    `x_id${id}` +
    `x_amount${amount.toFixed(decimalsFor(currency))}` +
    `x_currency${currency}` +
    `x_gateway_reference${asString(reference.gateway) ?? ''}` +
    `x_payment_reference${asString(reference.payment) ?? ''}` +
    `x_status${status}` +
    `x_created${created}`
  );
}

export function computeTapHashstring(body: Record<string, unknown>, secretKey: string): string | null {
  const input = tapHashInput(body);
  return input === null ? null : createHmac('sha256', secretKey).update(input, 'utf8').digest('hex');
}

/** Constant-time comparison of the received `hashstring` header with the one we compute. */
export function verifyTapHashstring(body: Record<string, unknown>, received: string | undefined, secretKey: string): boolean {
  if (!received || !secretKey) return false;
  const expected = computeTapHashstring(body, secretKey);
  if (!expected) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received.trim().toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const FAILURE_STATUSES = new Set(['ABANDONED', 'CANCELLED', 'FAILED', 'DECLINED', 'RESTRICTED', 'TIMEDOUT']);

function kindFor(object: string, status: string): ProviderEventKind | null {
  if (object === 'refund') {
    if (status === 'REFUNDED') return 'REFUNDED';
    if (FAILURE_STATUSES.has(status)) return 'ACTION_FAILED';
    return null;
  }
  if (object === 'authorize') {
    if (status === 'AUTHORIZED') return 'AUTHORIZED';
    if (status === 'CAPTURED') return 'CAPTURED';
    if (status === 'VOID') return 'VOIDED';
    if (FAILURE_STATUSES.has(status)) return 'FAILED';
    return null;
  }
  if (object === 'charge') {
    if (status === 'CAPTURED') return 'CAPTURED';
    if (FAILURE_STATUSES.has(status)) return 'FAILED';
    return null;
  }
  return null;
}

/** Translates a verified Tap payload (charge, authorize or refund object) into a ProviderEvent. */
export function normalizeTapEvent(body: Record<string, unknown>): ProviderEvent {
  const object = asString(body.object) ?? 'unknown';
  const status = asString(body.status) ?? 'UNKNOWN';
  const id = asString(body.id);
  const currency = asString(body.currency);
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
  const metadataAttemptId = asRecord(body.metadata).attempt_id;

  const amountMinor =
    currency && Number.isFinite(amount) ? Math.round(amount * 10 ** decimalsFor(currency)) : null;

  return {
    provider: 'tap',
    eventKey: `${id ?? 'unknown'}:${status}`,
    eventType: `${object}:${status}`,
    kind: id ? kindFor(object, status) : null,
    attemptId: isUuid(metadataAttemptId) ? metadataAttemptId.toLowerCase() : null,
    // A refund notification is about the charge it refunds.
    providerPaymentId: object === 'refund' ? asString(body.charge_id) : id,
    providerRefundId: object === 'refund' ? id : null,
    providerCustomerId: asString(asRecord(body.customer).id),
    amountMinor,
    currency,
    payload: body,
  };
}
