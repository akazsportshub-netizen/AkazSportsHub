import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { CreateRingerRequestDto, RespondToInviteDto } from './dto/ringer.dto';
import { RingersService } from './ringers.service';

@Controller()
export class RingersController {
  constructor(private readonly ringers: RingersService) {}

  /** Organizer: "we are N players short" — starts recruitment in the background. */
  @Post('bookings/:bookingId/ringer-requests')
  createRequest(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: CreateRingerRequestDto,
  ) {
    return this.ringers.createRequest(user, bookingId, dto.slots_needed);
  }

  @Get('ringer-invites/mine')
  listMine(@CurrentUser() user: AuthUser) {
    return this.ringers.listMyInvites(user);
  }

  @Post('ringer-invites/:inviteId/respond')
  @HttpCode(200)
  respond(
    @CurrentUser() user: AuthUser,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @Body() dto: RespondToInviteDto,
  ) {
    return this.ringers.respond(user, inviteId, dto.accept);
  }
}
