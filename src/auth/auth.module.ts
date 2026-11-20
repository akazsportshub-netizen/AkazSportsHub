import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DevAuthController } from './dev-auth.controller';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';

/** Sign-in: phone-number codes, plus the development stand-in (off unless DEV_LOGIN=true). */
@Module({
  imports: [NotificationsModule],
  controllers: [DevAuthController, OtpController],
  providers: [OtpService],
})
export class AuthModule {}
