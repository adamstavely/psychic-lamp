import { Module } from '@nestjs/common';
import { GovernanceModule } from '../governance/governance.module.js';
import { UsersModule } from '../users/users.module.js';
import { RegistryController } from './registry.controller.js';
import { RegistrySearch } from './registry-search.js';
import { RegistryService } from './registry.service.js';

@Module({
  imports: [UsersModule, GovernanceModule],
  controllers: [RegistryController],
  providers: [RegistryService, RegistrySearch],
  exports: [RegistryService, RegistrySearch],
})
export class RegistryModule {}
