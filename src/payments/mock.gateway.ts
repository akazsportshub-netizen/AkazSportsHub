import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { CreatePaymentInput, CreatePaymentResult, PaymentGateway, PaymentRef, ProviderActionResult } from './payment-gateway';

/**
 * Stand-in provider for local development (PAYMENT_PROVIDER=mock, refused in production).
 * No money moves. Complete a payment with
 *   POST /v1/dev/payments/attempts/:attemptId/simulate  { "outcome": "AUTHORIZED" | "CAPTURED" | "FAILED" }
 * Capture, void and refund succeed immediately.
 */
@Injectable()
export class MockGateway implements PaymentGateway {
  readonly name = 'mock' as const;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return {
      providerPaymentId: `mock_${input.attemptId}`,
      checkoutUrl: `${this.config.publicBaseUrl}/v1/dev/payments/attempts/${input.attemptId}`,
    };
  }

  async capture(ref: PaymentRef): Promise<ProviderActionResult> {
    return { final: true, reference: `mock_capture_${ref.attemptId}` };
  }

  async void(_ref: PaymentRef): Promise<ProviderActionResult> {
    return { final: true, reference: null };
  }

  async refund(ref: PaymentRef): Promise<ProviderActionResult> {
    return { final: true, reference: `mock_refund_${ref.attemptId}` };
  }
}
