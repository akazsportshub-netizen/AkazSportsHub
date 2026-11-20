import { Inject, Injectable } from '@nestjs/common';
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

/**
 * Checkout.com (https://www.checkout.com/docs) — card and Apple Pay acquiring, used where
 * it is the stronger rail (for example UAE cards). Amounts are sent in minor units.
 *
 * The customer pays on a Hosted Payments Page. The payment id (`pay_…`) is not known when
 * the page is created; it arrives with the first webhook and is matched through `reference`,
 * which carries our attempt id. Capture, void and refund are asynchronous (HTTP 202) and
 * are confirmed by webhook.
 */
@Injectable()
export class CheckoutGateway implements PaymentGateway {
  readonly name = 'checkout' as const;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const returnUrl = this.config.paymentReturnUrl;
    const response = await this.post('/hosted-payments', undefined, {
      amount: input.amountMinor,
      currency: input.currency,
      reference: input.attemptId,
      description: input.description,
      processing_channel_id: this.config.checkout.processingChannelId,
      billing: { address: { country: input.countryCode } },
      customer: {
        name: input.payer.fullName,
        ...(input.payer.email ? { email: input.payer.email } : {}),
      },
      capture: input.flow === 'CHARGE',
      metadata: { attempt_id: input.attemptId, booking_id: input.bookingId, share_id: input.shareId },
      success_url: returnUrl,
      failure_url: returnUrl,
      cancel_url: returnUrl,
    });
    const url = asString(asRecord(asRecord(response._links).redirect).href);
    if (!url) throw new PaymentGatewayError('checkout', 'no hosted payment page returned');
    return { providerPaymentId: null, checkoutUrl: url };
  }

  async capture(ref: PaymentRef): Promise<ProviderActionResult> {
    const response = await this.post(`/payments/${encodeURIComponent(ref.providerPaymentId)}/captures`, `capture-${ref.attemptId}`, {
      amount: ref.amountMinor,
      reference: ref.attemptId,
    });
    return { final: false, reference: asString(response.action_id) };
  }

  async void(ref: PaymentRef): Promise<ProviderActionResult> {
    const response = await this.post(`/payments/${encodeURIComponent(ref.providerPaymentId)}/voids`, `void-${ref.attemptId}`, {
      reference: ref.attemptId,
    });
    return { final: false, reference: asString(response.action_id) };
  }

  async refund(ref: PaymentRef): Promise<ProviderActionResult> {
    const response = await this.post(`/payments/${encodeURIComponent(ref.providerPaymentId)}/refunds`, `refund-${ref.attemptId}`, {
      amount: ref.amountMinor,
      reference: ref.attemptId,
    });
    return { final: false, reference: asString(response.action_id) };
  }

  async partialRefund(ref: PaymentRef, amountMinor: number, refundId: string): Promise<ProviderActionResult> {
    const response = await this.post(`/payments/${encodeURIComponent(ref.providerPaymentId)}/refunds`, `share-refund-${refundId}`, {
      amount: amountMinor,
      reference: ref.attemptId,
    });
    return { final: false, reference: asString(response.action_id) };
  }

  /** The idempotency key makes a retried capture/void/refund a no-op on Checkout.com's side. */
  private post(path: string, idempotencyKey: string | undefined, body: unknown): Promise<Record<string, unknown>> {
    const key = this.config.checkout.secretKey;
    if (!key) throw new PaymentGatewayError('checkout', 'CHECKOUT_SECRET_KEY is not configured');
    return postJson(
      'checkout',
      `${this.config.checkout.apiBase}${path}`,
      {
        Authorization: `Bearer ${key}`,
        ...(idempotencyKey ? { 'Cko-Idempotency-Key': idempotencyKey } : {}),
      },
      body,
    );
  }
}
