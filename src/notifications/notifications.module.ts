import { Module } from '@nestjs/common';
import { LogMessenger, MESSENGER } from './messenger';
import { NotificationsService } from './notifications.service';

@Module({
  // Replace LogMessenger with a Twilio or Unifonic adapter once a provider account exists.
  providers: [NotificationsService, { provide: MESSENGER, useClass: LogMessenger }],
  exports: [NotificationsService],
})
export class NotificationsModule {}
