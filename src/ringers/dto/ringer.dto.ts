import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class CreateRingerRequestDto {
  /** How many extra players the booking needs. */
  @IsInt()
  @Min(1)
  @Max(10)
  slots_needed!: number;
}

export class RespondToInviteDto {
  @IsBoolean()
  accept!: boolean;
}
