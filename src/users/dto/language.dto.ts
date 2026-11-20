import { IsIn } from 'class-validator';

export class SetLanguageDto {
  @IsIn(['en', 'ar'])
  locale!: 'en' | 'ar';
}
