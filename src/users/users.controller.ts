import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { LookupUserQueryDto } from './dto/lookup.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Find a friend by phone number to add to a split booking. Returns only their id and name. */
  @Get('lookup')
  lookup(@CurrentUser() user: AuthUser, @Query() query: LookupUserQueryDto) {
    return this.users.lookupByPhone(user.id, query.phone);
  }
}
