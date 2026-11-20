import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

export class LookupUserQueryDto {
  /** International format, e.g. +97455512345. Spaces and dashes are ignored; a leading space is read as the `+` that an unescaped URL turns into a space. */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/^\s/, '+').replace(/[\s-]/g, '') : value))
  @Matches(/^\+[1-9][0-9]{7,14}$/, { message: 'phone must be in international format, e.g. +97455512345' })
  phone!: string;
}
