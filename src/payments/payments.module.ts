import { Module } from '@nestjs/common';
import { CheckoutGateway } from './checkout.gateway';
import { DevPaymentsController } from './dev-payments.controller';
import { MockGateway } from './mock.gateway';
import { PaymentGatewayRegistry } from './payment-gateway.registry';
import { PaymentsService } from './payments.service';
import { TapGateway } from './tap.gateway';

@Module({
  controllers: [DevPaymentsController],
  providers: [TapGateway, CheckoutGateway, MockGateway, PaymentGatewayRegistry, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
