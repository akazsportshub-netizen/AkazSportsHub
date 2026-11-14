import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { CreateMatchDto, SyncMatchEventsDto } from './dto/match.dto';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Post()
  @Roles('REFEREE', 'VENUE_MANAGER', 'ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMatchDto) {
    return this.matches.create(user, dto);
  }

  @Get(':matchId')
  get(@Param('matchId', ParseUUIDPipe) matchId: string) {
    return this.matches.get(matchId);
  }

  /** Live White Card countdowns for the match console and scoreboard. */
  @Get(':matchId/sin-bins')
  getSinBins(@Param('matchId', ParseUUIDPipe) matchId: string) {
    return this.matches.getSinBins(matchId);
  }

  /** Offline-first sync from the referee console. Safe to retry with the same events. */
  @Post(':matchId/events/batch')
  @HttpCode(200)
  @Roles('REFEREE', 'ADMIN')
  syncEvents(
    @CurrentUser() user: AuthUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() dto: SyncMatchEventsDto,
  ) {
    return this.matches.syncEvents(user, matchId, dto);
  }
}
