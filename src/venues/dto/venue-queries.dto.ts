import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';

export const SPORTS = ['FOOTBALL', 'PADEL', 'BADMINTON', 'BASKETBALL', 'VOLLEYBALL', 'TENNIS', 'CRICKET'] as const;
export type Sport = (typeof SPORTS)[number];

export class NearbyVenuesQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  /** Search radius in kilometres. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radius_km?: number;

  @IsOptional()
  @IsIn(SPORTS)
  sport?: Sport;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CourtAvailabilityQueryDto {
  /** Calendar day in the venue's own time zone, e.g. 2026-11-20. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be formatted YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  date!: string;
}
