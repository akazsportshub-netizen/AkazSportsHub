import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from './decorators';
import { RequestEmailCodeDto, VerifyEmailCodeDto } from './dto/email.dto';
import { EmailLoginService } from './email-login.service';

@Public()
@Controller('auth/email')
export class EmailLoginController {
  constructor(private readonly emailLogin: EmailLoginService) {}

  /** Emails a six-digit code. */
  @Post('request')
  @HttpCode(200)
  request(@Body() dto: RequestEmailCodeDto, @Req() req: Request) {
    return this.emailLogin.requestCode(dto.email, req.ip ?? 'unknown', dto.locale);
  }

  /** Exchanges the code for tokens. Creates the account the first time (send `full_name` and `country`). */
  @Post('verify')
  @HttpCode(200)
  verify(@Body() dto: VerifyEmailCodeDto, @Req() req: Request) {
    return this.emailLogin.verifyCode(dto.email, dto.code, dto.full_name, dto.country, req.ip ?? 'unknown', dto.locale);
  }
}
