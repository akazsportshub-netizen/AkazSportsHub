import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MATCH_EVENT_TYPES, MatchEventType, TeamSide } from '../sin-bin';

const HAS_UTC_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

/** Most events one sync request may carry; a device with more sends several requests. */
export const MAX_EVENTS_PER_BATCH = 200;

export class CreateMatchDto {
  @IsUUID()
  court_id!: string;

  /** Link the match to the court booking it is played in. */
  @IsOptional()
  @IsUUID()
  booking_id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  home_team_name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  away_team_name!: string;

  @IsISO8601({ strict: true })
  @Matches(HAS_UTC_OFFSET, { message: 'scheduled_start must include a UTC offset' })
  scheduled_start!: string;

  /** Defaults to the caller when the caller is a referee. */
  @IsOptional()
  @IsUUID()
  referee_user_id?: string;
}

export class MatchEventDto {
  /** Generated on the referee's device when the event is recorded. Re-sending the same id is harmless. */
  @IsUUID()
  id!: string;

  @IsIn(MATCH_EVENT_TYPES)
  type!: MatchEventType;

  @IsOptional()
  @IsIn(['HOME', 'AWAY'])
  team_side?: TeamSide;

  @IsOptional()
  @IsUUID()
  player_user_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  player_name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  shirt_number?: number;

  /** Seconds on the match clock when the event happened. */
  @IsInt()
  @Min(0)
  @Max(4 * 60 * 60)
  match_clock_seconds!: number;

  /** Device time when the event happened, with UTC offset. */
  @IsISO8601({ strict: true })
  @Matches(HAS_UTC_OFFSET, { message: 'occurred_at must include a UTC offset' })
  occurred_at!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class SyncMatchEventsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  device_id?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EVENTS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => MatchEventDto)
  events!: MatchEventDto[];
}
