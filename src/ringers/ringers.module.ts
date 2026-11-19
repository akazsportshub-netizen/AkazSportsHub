import { Module } from '@nestjs/common';
import { RingersController } from './ringers.controller';
import { RingersService } from './ringers.service';

@Module({
  controllers: [RingersController],
  providers: [RingersService],
  exports: [RingersService],
})
export class RingersModule {}
