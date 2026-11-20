import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SPORTS } from '../../venues/dto/venue-queries.dto';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_UTC_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

export class CreateCourtDto {
  @IsString() @MinLength(1) @MaxLength(60)
  name!: string;

  @IsIn(SPORTS)
  sport!: (typeof SPORTS)[number];

  @IsOptional() @IsString() @MaxLength(40)
  surface?: string;

  @IsInt() @Min(2) @Max(30)
  capacity_players!: number;

  /** Minor units: 25000 is 250.00 in a two-decimal currency. */
  @IsInt() @Min(1) @Max(100_000_000)
  price_per_hour_minor!: number;

  @IsIn([30, 60, 90, 120])
  slot_minutes!: number;

  @Matches(HH_MM, { message: 'opens_at must look like 06:00' })
  opens_at!: string;

  @Matches(HH_MM, { message: 'closes_at must look like 23:00 (00:00 means midnight)' })
  closes_at!: string;
}

export class UpdateCourtDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60)
  name?: string;

  @IsOptional() @IsString() @MaxLength(40)
  surface?: string;

  @IsOptional() @IsInt() @Min(2) @Max(30)
  capacity_players?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100_000_000)
  price_per_hour_minor?: number;

  @IsOptional() @IsIn([30, 60, 90, 120])
  slot_minutes?: number;

  @IsOptional() @Matches(HH_MM, { message: 'opens_at must look like 06:00' })
  opens_at?: string;

  @IsOptional() @Matches(HH_MM, { message: 'closes_at must look like 23:00 (00:00 means midnight)' })
  closes_at?: string;

  @IsOptional() @IsBoolean()
  is_active?: boolean;
}

export class CreateBlockDto {
  @IsISO8601() @Matches(HAS_UTC_OFFSET, { message: 'starts_at must include a UTC offset, e.g. 2026-11-20T18:00:00+03:00' })
  starts_at!: string;

  @IsISO8601() @Matches(HAS_UTC_OFFSET, { message: 'ends_at must include a UTC offset, e.g. 2026-11-20T20:00:00+03:00' })
  ends_at!: string;

  @IsOptional() @IsString() @MaxLength(200)
  reason?: string;
}

export class ManagerBookingsQueryDto {
  /** Venue-local days, YYYY-MM-DD. Default: today and the next 14 days. */
  @IsOptional() @Matches(DAY) from?: string;
  @IsOptional() @Matches(DAY) to?: string;

  @IsOptional() @IsIn(['HOLD', 'CONFIRMED', 'COMPLETED', 'EXPIRED', 'CANCELLED'])
  status?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit?: number;
}

export class EarningsQueryDto {
  /** Venue-local days, YYYY-MM-DD. Default: the first of this month up to today. */
  @IsOptional() @Matches(DAY) from?: string;
  @IsOptional() @Matches(DAY) to?: string;
}
