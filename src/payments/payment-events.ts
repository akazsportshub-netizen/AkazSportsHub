import { PaymentProviderName } from '../config/app-config';

/**
 * What a provider webhook means for one of our payment attempts, once the
 * provider-specific payload has been verified and translated.
 *
 * AUTHORIZED     funds are held on the card
 * CAPTURED       funds were taken
 * FAILED         the customer did not complete the payment (declined, abandoned, timed out)
 * VOIDED         a hold was released
 * REFUNDED       captured funds were returned
 * ACTION_FAILED  a capture/void/refund we requested was rejected — needs a human
 */
export type ProviderEventKind = 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'VOIDED' | 'REFUNDED' | 'ACTION_FAILED';

export interface ProviderEvent {
  provider: PaymentProviderName;
  /** Unique per provider notification; redeliveries carry the same key and are ignored. */
  eventKey: string;
  /** Raw provider label, kept for the audit trail (e.g. "charge:CAPTURED", "payment_approved"). */
  eventType: string;
  /** null when the notification is of no interest (it is still stored). */
  kind: ProviderEventKind | null;
  /** Our payment_attempts.id as echoed back by the provider, when present and well-formed. */
  attemptId: string | null;
  /** Provider id of the authorization/charge/payment the event is about. */
  providerPaymentId: string | null;
  providerRefundId: string | null;
  providerCustomerId: string | null;
  amountMinor: number | null;
  currency: string | null;
  payload: unknown;
}

export type ProviderEventOutcome =
  | 'APPLIED'      // the attempt changed state
  | 'DUPLICATE'    // this notification was already processed
  | 'IGNORED'      // not a notification we act on
  | 'STALE'        // arrived out of order; the attempt is already past this state
  | 'UNMATCHED';   // no attempt found for it
