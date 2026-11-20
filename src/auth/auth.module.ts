import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DevAuthController } from './dev-auth.controller';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';
import { RefreshController } from './refresh.controller';
import { RefreshService } from './refresh.service';

/** Sign-in: phone-number codes, plus the development stand-in (off unless DEV_LOGIN=true). */
@Module({
  imports: [NotificationsModule],
  controllers: [DevAuthController, OtpController, RefreshController],
  providers: [OtpService, RefreshService],
})
export class AuthModule {}
