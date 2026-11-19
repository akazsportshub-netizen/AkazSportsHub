import { Module } from '@nestjs/common';
import { DevAuthController } from './dev-auth.controller';

/** Sign-in. For now only the development stand-in; OTP login and refresh tokens come later. */
@Module({
  controllers: [DevAuthController],
})
export class AuthModule {}
