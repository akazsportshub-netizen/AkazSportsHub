import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { AcademyService } from './academy.service';
import {
  BrowseGroupsDto, CreateChildDto, CreateGroupDto, EnrolDto, InvoicesQueryDto, MarkAttendanceDto, MonthDto, MoreSessionsDto, PayInvoiceDto,
  UpdateGroupDto, UpdateSessionDto, WaiveInvoiceDto,
} from './dto/academy.dto';

/** The venue side of the academy. Every route is limited to venues the caller manages. */
@Roles('VENUE_MANAGER')
@Controller('manager')
export class AcademyManagerController {
  constructor(private readonly academy: AcademyService) {}

  @Get('venues/:venueId/academy/groups')
  groups(@Param('venueId', ParseUUIDPipe) venueId: string, @CurrentUser() user: AuthUser) {
    return this.academy.managerGroups(venueId, user);
  }

  @Post('venues/:venueId/academy/groups')
  createGroup(@Param('venueId', ParseUUIDPipe) venueId: string, @Body() dto: CreateGroupDto, @CurrentUser() user: AuthUser) {
    return this.academy.createGroup(venueId, dto, user);
  }

  @Patch('academy/groups/:groupId')
  updateGroup(@Param('groupId', ParseUUIDPipe) groupId: string, @Body() dto: UpdateGroupDto, @CurrentUser() user: AuthUser) {
    return this.academy.updateGroup(groupId, dto, user);
  }

  @Get('academy/groups/:groupId/roster')
  roster(@Param('groupId', ParseUUIDPipe) groupId: string, @CurrentUser() user: AuthUser) {
    return this.academy.roster(groupId, user);
  }

  @Get('academy/groups/:groupId/sessions')
  sessions(@Param('groupId', ParseUUIDPipe) groupId: string, @CurrentUser() user: AuthUser) {
    return this.academy.sessions(groupId, user);
  }

  @Post('academy/groups/:groupId/sessions')
  @HttpCode(200)
  moreSessions(@Param('groupId', ParseUUIDPipe) groupId: string, @Body() dto: MoreSessionsDto, @CurrentUser() user: AuthUser) {
    return this.academy.moreSessions(groupId, dto, user);
  }

  @Patch('academy/sessions/:sessionId')
  updateSession(@Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() dto: UpdateSessionDto, @CurrentUser() user: AuthUser) {
    return this.academy.updateSession(sessionId, dto, user);
  }

  @Get('academy/sessions/:sessionId/attendance')
  attendance(@Param('sessionId', ParseUUIDPipe) sessionId: string, @CurrentUser() user: AuthUser) {
    return this.academy.attendance(sessionId, user);
  }

  @Put('academy/sessions/:sessionId/attendance')
  markAttendance(@Param('sessionId', ParseUUIDPipe) sessionId: string, @Body() dto: MarkAttendanceDto, @CurrentUser() user: AuthUser) {
    return this.academy.markAttendance(sessionId, dto, user);
  }

  @Post('venues/:venueId/academy/invoices')
  @HttpCode(200)
  createInvoices(@Param('venueId', ParseUUIDPipe) venueId: string, @Body() dto: MonthDto, @CurrentUser() user: AuthUser) {
    return this.academy.createInvoices(venueId, dto.month, user);
  }

  @Get('venues/:venueId/academy/invoices')
  invoices(@Param('venueId', ParseUUIDPipe) venueId: string, @Query() query: InvoicesQueryDto, @CurrentUser() user: AuthUser) {
    return this.academy.invoices(venueId, query, user);
  }

  @Post('academy/invoices/:invoiceId/pay')
  @HttpCode(200)
  pay(@Param('invoiceId', ParseUUIDPipe) invoiceId: string, @Body() dto: PayInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.academy.markPaid(invoiceId, dto, user);
  }

  @Post('academy/invoices/:invoiceId/waive')
  @HttpCode(200)
  waive(@Param('invoiceId', ParseUUIDPipe) invoiceId: string, @Body() dto: WaiveInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.academy.waive(invoiceId, dto, user);
  }
}

/** The family side: browse groups, enrol a child, follow attendance and fees. Any signed-in user. */
@Controller('academy')
export class AcademyController {
  constructor(private readonly academy: AcademyService) {}

  @Get('groups')
  browse(@Query() query: BrowseGroupsDto) {
    return this.academy.browse(query);
  }

  @Post('groups/:groupId/enrol')
  enrol(@Param('groupId', ParseUUIDPipe) groupId: string, @Body() dto: EnrolDto, @CurrentUser() user: AuthUser) {
    return this.academy.enrol(groupId, dto, user);
  }

  @Get('children')
  children(@CurrentUser() user: AuthUser) {
    return this.academy.children(user);
  }

  @Post('children')
  addChild(@Body() dto: CreateChildDto, @CurrentUser() user: AuthUser) {
    return this.academy.addChild(dto, user);
  }

  @Get('enrolments')
  mine(@CurrentUser() user: AuthUser) {
    return this.academy.myEnrolments(user);
  }

  @Get('enrolments/:id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.academy.enrolmentDetail(id, user);
  }

  @Post('enrolments/:id/leave')
  @HttpCode(200)
  leave(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.academy.leave(id, user);
  }
}
