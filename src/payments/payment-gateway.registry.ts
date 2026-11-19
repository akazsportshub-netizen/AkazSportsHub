import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig, PaymentProviderName } from '../config/app-config';
import { CheckoutGateway } from './checkout.gateway';
import { MockGateway } from './mock.gateway';
import { PaymentGateway } from './payment-gateway';
import { TapGateway } from './tap.gateway';

/**
 * Resolves a provider name to its gateway. New payments use the provider set in
 * PAYMENT_PROVIDER; follow-up actions (capture, void, refund) always go to the
 * provider recorded on the attempt, so switching provider never strands old payments.
 */
@Injectable()
export class PaymentGatewayRegistry {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly tap: TapGateway,
    private readonly checkout: CheckoutGateway,
    private readonly mock: MockGateway,
  ) {}

  forNewPayments(): PaymentGateway {
    return this.get(this.config.paymentProvider);
  }

  get(name: PaymentProviderName): PaymentGateway {
    switch (name) {
      case 'tap':
        return this.tap;
      case 'checkout':
        return this.checkout;
      case 'mock':
        return this.mock;
    }
  }
}
