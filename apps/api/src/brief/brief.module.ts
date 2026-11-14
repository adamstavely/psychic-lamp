import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { BriefController } from './brief.controller.js';
import { BriefService } from './brief.service.js';

@Module({
  imports: [UsersModule],
  controllers: [BriefController],
  providers: [BriefService],
  exports: [BriefService],
})
export class BriefModule {}
