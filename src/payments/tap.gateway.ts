import { Inject, Injectable } from '@nestjs/common';
import { minorToMajorNumber } from '../common/money';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import {
  asRecord,
  asString,
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentGateway,
  PaymentGatewayError,
  PaymentRef,
  postJson,
  ProviderActionResult,
} from './payment-gateway';

/** Dialling codes of the GCC markets, used to split an E.164 number the way Tap expects. */
const GCC_DIALLING_CODES = ['974', '966', '971', '973', '968', '965'];

export function splitGccPhone(phoneE164: string | null): { country_code: string; number: string } | null {
  if (!phoneE164) return null;
  const digits = phoneE164.replace(/^\+/, '');
  const code = GCC_DIALLING_CODES.find((candidate) => digits.startsWith(candidate));
  return code ? { country_code: code, number: digits.slice(code.length) } : null;
}

/**
 * Tap Payments (https://developers.tap.company) — the primary GCC rail: Apple Pay, mada,
 * NAPS/QPay, BenefitPay, OmanNet and cards. Amounts are sent as decimal major units.
 *
 * Request shapes follow Tap's public API reference. Before go-live, run each of the four
 * calls below against a Tap sandbox key and confirm the fields marked "verify".
 */
@Injectable()
export class TapGateway implements PaymentGateway {
  readonly name = 'tap' as const;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const [firstName, ...rest] = input.payer.fullName.trim().split(/\s+/);
    const phone = splitGccPhone(input.payer.phoneE164);

    const body = {
      amount: minorToMajorNumber(input.amountMinor, input.currency),
      currency: input.currency,
      customer_initiated: true,
      threeDSecure: true,
      save_card: false,
      description: input.description,
      metadata: this.metadata(input.attemptId, input.bookingId, input.shareId),
      reference: { transaction: input.attemptId, order: input.bookingId },
      receipt: { email: false, sms: false },
      customer: {
        first_name: firstName || 'Player',
        ...(rest.length > 0 ? { last_name: rest.join(' ') } : {}),
        ...(input.payer.email ? { email: input.payer.email } : {}),
        ...(phone ? { phone } : {}),
      },
      // Authorizations are card-only at Tap; a charge shows every method enabled on the merchant account.
      source: { id: input.flow === 'AUTHORIZE' ? 'src_card' : 'src_all' },
      // Provider-side safety net: Tap voids the hold itself if we never capture it. (verify: `time` is in hours)
      ...(input.flow === 'AUTHORIZE' ? { auto: { type: 'VOID', time: 1 } } : {}),
      post: { url: this.webhookUrl() },
      redirect: { url: this.config.paymentReturnUrl },
    };

    const path = input.flow === 'AUTHORIZE' ? '/authorize' : '/charges';
    const response = await this.post(path, body);
    const id = asString(response.id);
    const url = asString(asRecord(response.transaction).url);
    if (!id || !url) {
      throw new PaymentGatewayError('tap', `no payment page returned (status ${asString(response.status) ?? 'unknown'})`);
    }
    return { providerPaymentId: id, checkoutUrl: url };
  }

  /** Capturing an authorization = creating a charge whose source is the authorize id. */
  async capture(ref: PaymentRef): Promise<ProviderActionResult> {
    const response = await this.post('/charges', {
      amount: minorToMajorNumber(ref.amountMinor, ref.currency),
      currency: ref.currency,
      customer_initiated: false,
      metadata: { attempt_id: ref.attemptId },
      reference: { transaction: ref.attemptId },
      ...(ref.providerCustomerId ? { customer: { id: ref.providerCustomerId } } : {}),   // verify: Tap asks for the customer id of the authorization
      source: { id: ref.providerPaymentId },
      post: { url: this.webhookUrl() },
      redirect: { url: this.config.paymentReturnUrl },
    });
    const status = asString(response.status);
    return { final: status === 'CAPTURED', reference: asString(response.id) };
  }

  async void(ref: PaymentRef): Promise<ProviderActionResult> {
    const response = await this.post(`/authorize/${encodeURIComponent(ref.providerPaymentId)}/void`, undefined);
    const status = asString(response.status);
    return { final: status === 'VOID', reference: null };
  }

  async refund(ref: PaymentRef): Promise<ProviderActionResult> {
    const response = await this.post('/refunds', {
      charge_id: ref.providerCaptureId ?? ref.providerPaymentId,
      amount: minorToMajorNumber(ref.amountMinor, ref.currency),
      currency: ref.currency,
      reason: 'requested_by_customer',
      description: 'Booking was not completed',
      metadata: { attempt_id: ref.attemptId },
      reference: { merchant: ref.attemptId },
      post: { url: this.webhookUrl() },
    });
    const status = asString(response.status);
    return { final: status === 'REFUNDED', reference: asString(response.id) };
  }

  async partialRefund(ref: PaymentRef, amountMinor: number, refundId: string): Promise<ProviderActionResult> {
    const response = await this.post('/refunds', {
      charge_id: ref.providerCaptureId ?? ref.providerPaymentId,
      amount: minorToMajorNumber(amountMinor, ref.currency),
      currency: ref.currency,
      reason: 'requested_by_customer',
      description: 'A player joined the booking, so your share is lower',
      metadata: { attempt_id: ref.attemptId, share_refund_id: refundId },
      reference: { merchant: refundId },
      post: { url: this.webhookUrl() },
    });
    const status = asString(response.status);
    return { final: status === 'REFUNDED', reference: asString(response.id) };
  }

  private metadata(attemptId: string, bookingId: string, shareId: string): Record<string, string> {
    return { attempt_id: attemptId, booking_id: bookingId, share_id: shareId };
  }

  private webhookUrl(): string {
    return `${this.config.publicBaseUrl}/v1/webhooks/tap`;
  }

  private post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const key = this.config.tap.secretKey;
    if (!key) throw new PaymentGatewayError('tap', 'TAP_SECRET_KEY is not configured');
    return postJson('tap', `${this.config.tap.apiBase}${path}`, { Authorization: `Bearer ${key}` }, body);
  }
}
