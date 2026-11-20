import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { normalizePhone } from '../otp';

const cleanPhone = Transform(({ value }) => (typeof value === 'string' ? (normalizePhone(value) ?? value) : value));

export class RequestOtpDto {
  @cleanPhone
  @Matches(/^\+[1-9][0-9]{7,14}$/, { message: 'phone must be in international format, e.g. +97455500010' })
  phone!: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @Matches(/^[0-9]{6}$/, { message: 'code must be the 6 digits we sent' })
  code!: string;

  /** Needed only the first time a number signs in, to create the account. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  full_name?: string;
}
