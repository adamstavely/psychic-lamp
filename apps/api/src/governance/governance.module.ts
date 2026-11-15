import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { GovernanceController } from './governance.controller.js';
import { GovernanceService } from './governance.service.js';

@Module({
  imports: [UsersModule],
  controllers: [GovernanceController],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
