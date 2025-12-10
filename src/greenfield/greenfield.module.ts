import { Module } from '@nestjs/common';
import { GreenfieldController } from './greenfield.controller';
import { GreenfieldService } from './greenfield.service';

@Module({
  controllers: [GreenfieldController],
  providers: [GreenfieldService],
  exports: [GreenfieldService],
})
export class GreenfieldModule {}
