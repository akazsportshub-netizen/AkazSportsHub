import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { AssignTeamsDto, CandidateBookingsQueryDto } from './dto/ratings.dto';
import { RatingsService } from './ratings.service';

@Controller()
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  /** The caller's rating and their last ten rated matches. */
  @Get('ratings/me')
  me(@CurrentUser() user: AuthUser) {
    return this.ratings.myRating(user);
  }

  /** Bookings a referee can start a rated match from. */
  @Get('referee/bookings')
  @Roles('REFEREE', 'VENUE_MANAGER', 'ADMIN')
  candidates(@Query() query: CandidateBookingsQueryDto) {
    return this.ratings.candidateBookings(query.court_id);
  }

  @Get('matches/:matchId/teams')
  teams(@CurrentUser() user: AuthUser, @Param('matchId', ParseUUIDPipe) matchId: string) {
    return this.ratings.getTeams(user, matchId);
  }

  /** Splits the booking's paid players into two teams of similar strength. */
  @Post('matches/:matchId/teams/auto')
  @HttpCode(200)
  autoBalance(@CurrentUser() user: AuthUser, @Param('matchId', ParseUUIDPipe) matchId: string) {
    return this.ratings.autoBalance(user, matchId);
  }

  /** Moves players between teams. */
  @Put('matches/:matchId/teams')
  setTeams(@CurrentUser() user: AuthUser, @Param('matchId', ParseUUIDPipe) matchId: string, @Body() dto: AssignTeamsDto) {
    return this.ratings.setTeams(user, matchId, dto.assignments);
  }
}
