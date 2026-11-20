import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from './decorators';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { OtpService } from './otp.service';

@Public()
@Controller('auth/otp')
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  /** Sends a six-digit code by SMS. */
  @Post('request')
  @HttpCode(200)
  request(@Body() dto: RequestOtpDto, @Req() req: Request) {
    return this.otp.requestCode(dto.phone, req.ip ?? 'unknown', dto.locale);
  }

  /** Exchanges the code for an access token. Creates the account the first time (send `full_name`). */
  @Post('verify')
  @HttpCode(200)
  verify(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.otp.verifyCode(dto.phone, dto.code, dto.full_name, req.ip ?? 'unknown', dto.locale);
  }
}
