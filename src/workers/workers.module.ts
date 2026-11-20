import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { RingersModule } from '../ringers/ringers.module';
import { HoldExpiryWorker } from './hold-expiry.worker';
import { PaymentSettlementWorker } from './payment-settlement.worker';
import { RingerRecruitmentWorker } from './ringer-recruitment.worker';
import { WorkersService } from './workers.service';

@Module({
  imports: [BookingsModule, NotificationsModule, PaymentsModule, RingersModule],
  providers: [HoldExpiryWorker, PaymentSettlementWorker, RingerRecruitmentWorker, WorkersService],
})
export class WorkersModule {}
