import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Public } from './decorators';
import { RefreshDto } from './dto/refresh.dto';
import { RefreshService } from './refresh.service';

@Public()
@Controller('auth')
export class RefreshController {
  constructor(private readonly refreshTokens: RefreshService) {}

  /** Trades the refresh token for a new access token and a new refresh token (the old one stops working). */
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.refreshTokens.refresh(dto.refresh_token);
  }

  /** Signs this device out for good. */
  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: RefreshDto) {
    return this.refreshTokens.revoke(dto.refresh_token);
  }
}
