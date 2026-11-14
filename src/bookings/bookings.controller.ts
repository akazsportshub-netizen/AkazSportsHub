import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { PaymentsService } from '../payments/payments.service';
import { BookingsService } from './bookings.service';
import { CancelBookingDto, CreateBookingDto, PayShareDto } from './dto/booking.dto';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService,
  ) {}

  /** Reserve a slot for 15 minutes and create the payment shares. */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookings.createHold(user, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: AuthUser) {
    return this.bookings.listMine(user);
  }

  @Get(':bookingId')
  get(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.bookings.getBooking(user, bookingId);
  }

  /** Get a hosted payment page for one share. Returns `checkout_url` to open in the app. */
  @Post(':bookingId/shares/:shareId/pay')
  @HttpCode(200)
  pay(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Body() dto: PayShareDto,
  ) {
    return this.payments.startPayment(user, bookingId, shareId, dto.flow ?? 'CHARGE');
  }

  @Post(':bookingId/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookings.cancel(user, bookingId, dto.reason);
  }
}
