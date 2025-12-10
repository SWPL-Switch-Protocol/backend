import { Module } from '@nestjs/common';
import { DidController } from './did.controller';
import { DidService } from './did.service';
import { GreenfieldModule } from '../greenfield/greenfield.module';

@Module({
  imports: [GreenfieldModule],
  controllers: [DidController],
  providers: [DidService],
})
export class DidModule {}
