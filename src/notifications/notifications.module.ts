import { Module } from '@nestjs/common';
import { EMAIL_SENDER, LogEmailSender, ResendEmailSender, resendSettingsFromEnv } from './email';
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
    {
      provide: EMAIL_SENDER,
      // Resend when its settings are present; otherwise the log-only sender, which refuses in production.
      useFactory: () => {
        const resend = resendSettingsFromEnv(process.env);
        return resend ? new ResendEmailSender(resend) : new LogEmailSender();
      },
    },
  ],
  exports: [NotificationsService, MESSENGER, EMAIL_SENDER],
})
export class NotificationsModule {}
