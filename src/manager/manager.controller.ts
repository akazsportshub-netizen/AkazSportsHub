import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { CreateBlockDto, CreateCourtDto, EarningsQueryDto, ManagerBookingsQueryDto, UpdateCourtDto } from './dto/manager.dto';
import { ManagerService } from './manager.service';

/** The venue manager console. Every route is limited to venues the caller manages. */
@Roles('VENUE_MANAGER')
@Controller('manager')
export class ManagerController {
  constructor(private readonly manager: ManagerService) {}

  @Get('venues')
  venues(@CurrentUser() user: AuthUser) {
    return this.manager.myVenues(user);
  }

  @Get('venues/:venueId/bookings')
  bookings(@Param('venueId', ParseUUIDPipe) venueId: string, @Query() query: ManagerBookingsQueryDto, @CurrentUser() user: AuthUser) {
    return this.manager.bookings(venueId, query, user);
  }

  @Get('venues/:venueId/courts')
  courts(@Param('venueId', ParseUUIDPipe) venueId: string, @CurrentUser() user: AuthUser) {
    return this.manager.courts(venueId, user);
  }

  @Post('venues/:venueId/courts')
  createCourt(@Param('venueId', ParseUUIDPipe) venueId: string, @Body() dto: CreateCourtDto, @CurrentUser() user: AuthUser) {
    return this.manager.createCourt(venueId, dto, user);
  }

  @Patch('courts/:courtId')
  updateCourt(@Param('courtId', ParseUUIDPipe) courtId: string, @Body() dto: UpdateCourtDto, @CurrentUser() user: AuthUser) {
    return this.manager.updateCourt(courtId, dto, user);
  }

  @Get('venues/:venueId/blocks')
  blocks(@Param('venueId', ParseUUIDPipe) venueId: string, @CurrentUser() user: AuthUser) {
    return this.manager.blocks(venueId, user);
  }

  @Post('courts/:courtId/blocks')
  createBlock(@Param('courtId', ParseUUIDPipe) courtId: string, @Body() dto: CreateBlockDto, @CurrentUser() user: AuthUser) {
    return this.manager.createBlock(courtId, dto, user);
  }

  @Delete('blocks/:blockId')
  @HttpCode(200)
  deleteBlock(@Param('blockId', ParseUUIDPipe) blockId: string, @CurrentUser() user: AuthUser) {
    return this.manager.deleteBlock(blockId, user);
  }

  @Get('venues/:venueId/earnings')
  earnings(@Param('venueId', ParseUUIDPipe) venueId: string, @Query() query: EarningsQueryDto, @CurrentUser() user: AuthUser) {
    return this.manager.earnings(venueId, query, user);
  }
}
