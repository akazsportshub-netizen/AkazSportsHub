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
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_SHARES } from '../split';

/** A timestamp without an explicit offset would be read in the server's zone — refuse it. */
const HAS_UTC_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;
const OFFSET_MESSAGE = 'must include a UTC offset, e.g. 2026-11-20T18:00:00+03:00';

export class BookingShareDto {
  @IsUUID()
  user_id!: string;

  /** Minor units. Omit on every share to split equally. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amount_minor?: number;
}

export class CreateBookingDto {
  @IsUUID()
  court_id!: string;

  @IsISO8601({ strict: true })
  @Matches(HAS_UTC_OFFSET, { message: `starts_at ${OFFSET_MESSAGE}` })
  starts_at!: string;

  @IsISO8601({ strict: true })
  @Matches(HAS_UTC_OFFSET, { message: `ends_at ${OFFSET_MESSAGE}` })
  ends_at!: string;

  /**
   * Who pays. Omit to pay the whole booking yourself. List the organizer first if
   * they take part — the first payers absorb any indivisible remainder of an equal split.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SHARES)
  @ValidateNested({ each: true })
  @Type(() => BookingShareDto)
  shares?: BookingShareDto[];
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class PayShareDto {
  /**
   * AUTHORIZE holds the amount on a credit card until the whole booking is paid.
   * CHARGE (default) takes it immediately and works with every payment method.
   */
  @IsOptional()
  @IsIn(['AUTHORIZE', 'CHARGE'])
  flow?: 'AUTHORIZE' | 'CHARGE';
}
