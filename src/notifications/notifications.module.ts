import { Module } from '@nestjs/common';
import { LogMessenger, MESSENGER } from './messenger';
import { NotificationsService } from './notifications.service';
import { UnifonicMessenger, unifonicSettingsFromEnv } from './unifonic';

@Module({
  providers: [
    NotificationsService,
    {
      provide: MESSENGER,
      // Unifonic when its settings are present; otherwise the log-only messenger,
      // which refuses to run in production.
      useFactory: () => {
        const unifonic = unifonicSettingsFromEnv(process.env);
        return unifonic ? new UnifonicMessenger(unifonic) : new LogMessenger();
      },
    },
  ],
  exports: [NotificationsService, MESSENGER],
})
export class NotificationsModule {}
