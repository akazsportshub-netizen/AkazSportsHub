import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SetLocationDto {
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(-180)
  @Max(180)
  lng!: number;

  /** Also agree to be invited to nearby games that are a player short. Left unchanged if omitted. */
  @IsOptional()
  @IsBoolean()
  open_to_ringer?: boolean;
}
