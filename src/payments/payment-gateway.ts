import { CurrencyCode } from '../common/money';
import { PaymentProviderName } from '../config/app-config';

/**
 * AUTHORIZE — place a hold on a credit card and capture it once every share is in.
 *             Nothing leaves the customer's account if the booking falls through.
 * CHARGE    — take the money immediately. Needed for debit rails (mada, NAPS, BenefitPay,
 *             OmanNet…) that cannot hold funds; refunded if the booking falls through.
 */
export type PaymentFlow = 'AUTHORIZE' | 'CHARGE';

export interface PayerDetails {
  fullName: string;
  email: string | null;
  phoneE164: string | null;
}

export interface CreatePaymentInput {
  /** Our payment_attempts.id — sent as the provider reference and echoed back in webhooks. */
  attemptId: string;
  bookingId: string;
  shareId: string;
  flow: PaymentFlow;
  amountMinor: number;
  currency: CurrencyCode;
  /** ISO 3166-1 alpha-2 country of the venue. */
  countryCode: string;
  description: string;
  payer: PayerDetails;
}

export interface CreatePaymentResult {
  /** Provider id of the authorization/charge when it is already known at creation time. */
  providerPaymentId: string | null;
  /** Hosted payment page the customer must be sent to. */
  checkoutUrl: string;
}

export interface PaymentRef {
  attemptId: string;
  providerPaymentId: string;
  /** Tap only: the charge created when an authorization was captured. */
  providerCaptureId: string | null;
  providerCustomerId: string | null;
  amountMinor: number;
  currency: CurrencyCode;
}

export interface ProviderActionResult {
  /**
   * true  — the provider confirmed the action in its response.
   * false — the provider accepted the request and will confirm by webhook.
   */
  final: boolean;
  /** Id of the capture charge or refund created by the action, when the provider returns one. */
  reference: string | null;
}

export interface PaymentGateway {
  readonly name: PaymentProviderName;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  capture(ref: PaymentRef): Promise<ProviderActionResult>;
  void(ref: PaymentRef): Promise<ProviderActionResult>;
  refund(ref: PaymentRef): Promise<ProviderActionResult>;
}

/** A provider call failed (network, non-2xx, or an unexpected response). */
export class PaymentGatewayError extends Error {
  constructor(
    public readonly provider: PaymentProviderName,
    message: string,
    public readonly httpStatus: number | null = null,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'PaymentGatewayError';
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

/** JSON POST with a timeout; returns the parsed body or throws PaymentGatewayError. */
export async function postJson(
  provider: PaymentProviderName,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PaymentGatewayError(provider, `request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const text = await response.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }
  }
  if (!response.ok) {
    throw new PaymentGatewayError(provider, `HTTP ${response.status} from ${url}: ${text.slice(0, 500)}`, response.status);
  }
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}
