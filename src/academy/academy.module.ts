import { Module } from '@nestjs/common';
import { AcademyController, AcademyManagerController } from './academy.controller';
import { AcademyService } from './academy.service';

@Module({ controllers: [AcademyManagerController, AcademyController], providers: [AcademyService] })
export class AcademyModule {}
