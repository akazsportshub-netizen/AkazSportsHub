import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DevAuthController } from './dev-auth.controller';
import { EmailLoginController } from './email-login.controller';
import { EmailLoginService } from './email-login.service';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';
import { RefreshController } from './refresh.controller';
import { RefreshService } from './refresh.service';

/** Sign-in: phone-number codes, email codes, plus the development stand-in (off unless DEV_LOGIN=true). */
@Module({
  imports: [NotificationsModule],
  controllers: [DevAuthController, OtpController, EmailLoginController, RefreshController],
  providers: [OtpService, EmailLoginService, RefreshService],
})
export class AuthModule {}
