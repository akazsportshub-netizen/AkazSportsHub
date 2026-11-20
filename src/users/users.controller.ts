import { Body, Controller, Get, HttpCode, Patch, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { SetLanguageDto } from './dto/language.dto';
import { SetLocationDto } from './dto/location.dto';
import { LookupUserQueryDto } from './dto/lookup.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Saves the player's home area (rounded to ~100 m) so nearby games can invite them. */
  @Patch('me/location')
  @HttpCode(200)
  setLocation(@CurrentUser() user: AuthUser, @Body() dto: SetLocationDto) {
    return this.users.setLocation(user.id, dto.lat, dto.lng, dto.open_to_ringer);
  }

  /** Sets the language for this player's messages (the app also switches its screens). */
  @Patch('me/language')
  @HttpCode(200)
  setLanguage(@CurrentUser() user: AuthUser, @Body() dto: SetLanguageDto) {
    return this.users.setLanguage(user.id, dto.locale);
  }

  /** Find a friend by phone number to add to a split booking. Returns only their id and name. */
  @Get('lookup')
  lookup(@CurrentUser() user: AuthUser, @Query() query: LookupUserQueryDto) {
    return this.users.lookupByPhone(user.id, query.phone);
  }
}
