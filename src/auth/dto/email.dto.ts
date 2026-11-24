import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { GCC_COUNTRIES, normalizeEmail } from '../email';

const cleanEmail = Transform(({ value }) => (typeof value === 'string' ? (normalizeEmail(value) ?? value) : value));

export class RequestEmailCodeDto {
  @cleanEmail
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, { message: 'email must be a valid address' })
  @MaxLength(254)
  email!: string;

  /** Language for the email and for a new account. Existing accounts keep their own setting. */
  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: 'en' | 'ar';
}

export class VerifyEmailCodeDto extends RequestEmailCodeDto {
  @Matches(/^[0-9]{6}$/, { message: 'code must be the 6 digits we sent' })
  code!: string;

  /** Needed only the first time an address signs in, to create the account. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  full_name?: string;

  /** Needed with `full_name` for a new account: an email has no country prefix to read it from. */
  @IsOptional()
  @IsIn([...GCC_COUNTRIES])
  country?: string;
}
