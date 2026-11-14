import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { CourtAvailabilityQueryDto, NearbyVenuesQueryDto } from './dto/venue-queries.dto';
import { VenuesService } from './venues.service';

/** Court discovery is open to everyone, signed in or not. */
@Public()
@Controller()
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  /** GET /v1/venues/nearby?lat=25.286&lng=51.5&radius_km=10&sport=FOOTBALL */
  @Get('venues/nearby')
  findNearby(@Query() query: NearbyVenuesQueryDto) {
    return this.venues.findNearby(query);
  }

  @Get('venues/:venueId')
  getVenue(@Param('venueId', ParseUUIDPipe) venueId: string) {
    return this.venues.getVenue(venueId);
  }

  /** GET /v1/courts/:courtId/availability?date=2026-11-20 */
  @Get('courts/:courtId/availability')
  getAvailability(@Param('courtId', ParseUUIDPipe) courtId: string, @Query() query: CourtAvailabilityQueryDto) {
    return this.venues.getCourtAvailability(courtId, query.date);
  }
}
