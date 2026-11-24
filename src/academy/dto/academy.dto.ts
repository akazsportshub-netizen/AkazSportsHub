import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { SPORTS } from '../../venues/dto/venue-queries.dto';
import { ATTENDANCE } from '../academy';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

export class CreateGroupDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsIn(SPORTS) sport!: (typeof SPORTS)[number];
  @IsOptional() @IsString() @MaxLength(20) age_group?: string;
  @IsOptional() @IsString() @MaxLength(80) coach_name?: string;
  /** 1 = Monday ... 7 = Sunday. */
  @IsInt() @Min(1) @Max(7) weekday!: number;
  @Matches(HH_MM, { message: 'starts_at must look like 17:30' }) starts_at!: string;
  @IsInt() @Min(15) @Max(240) duration_minutes!: number;
  /** Minor units: 15000 is 150.00 in a two-decimal currency. */
  @IsInt() @Min(0) @Max(100_000_000) monthly_fee_minor!: number;
  @IsInt() @Min(1) @Max(200) capacity!: number;
}

export class UpdateGroupDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(20) age_group?: string;
  @IsOptional() @IsString() @MaxLength(80) coach_name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) monthly_fee_minor?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) capacity?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

export class MoreSessionsDto {
  /** How many weeks to add from today. */
  @IsInt() @Min(1) @Max(26) weeks!: number;
}

export class UpdateSessionDto {
  @IsOptional() @IsBoolean() cancelled?: boolean;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class MarkDto {
  @IsUUID() enrolment_id!: string;
  @IsIn(ATTENDANCE) status!: (typeof ATTENDANCE)[number];
}

export class MarkAttendanceDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => MarkDto)
  marks!: MarkDto[];
}

export class MonthDto {
  @Matches(MONTH, { message: 'month must look like 2026-12' }) month!: string;
}

export class InvoicesQueryDto {
  @IsOptional() @Matches(MONTH) month?: string;
  @IsOptional() @IsIn(['DUE', 'PAID', 'WAIVED']) status?: string;
}

export class PayInvoiceDto {
  @IsIn(['CASH', 'BANK', 'OTHER']) method!: 'CASH' | 'BANK' | 'OTHER';
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class WaiveInvoiceDto {
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class BrowseGroupsDto {
  @IsOptional() @IsUUID() venue_id?: string;
  @IsOptional() @IsIn(SPORTS) sport?: string;
}

export class EnrolDto {
  /** A child profile of the caller. Leave out to enrol the caller themself. */
  @IsOptional() @IsUUID() dependent_id?: string;
}

export class CreateChildDto {
  @IsString() @MinLength(1) @MaxLength(80) full_name!: string;
  @IsOptional() @Matches(DAY, { message: 'date_of_birth must look like 2016-04-21' }) date_of_birth?: string;
  @IsOptional() @IsString() @MaxLength(20) age_group?: string;
}
