import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  refresh_token!: string;
}
