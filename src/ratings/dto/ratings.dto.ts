import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsUUID, ValidateNested } from 'class-validator';

export class TeamAssignmentDto {
  @IsUUID()
  user_id!: string;

  @IsIn(['HOME', 'AWAY'])
  side!: 'HOME' | 'AWAY';
}

export class AssignTeamsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TeamAssignmentDto)
  assignments!: TeamAssignmentDto[];
}

export class CandidateBookingsQueryDto {
  @IsUUID()
  court_id!: string;
}
