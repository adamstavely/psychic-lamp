import { Module } from '@nestjs/common';
import { SeedModule } from '../seed/seed.module.js';
import { UsersModule } from '../users/users.module.js';
import { ArtifactSearch } from './artifact-search.js';
import { ArtifactsController } from './artifacts.controller.js';
import { ArtifactsService } from './artifacts.service.js';

@Module({
  imports: [UsersModule, SeedModule],
  controllers: [ArtifactsController],
  providers: [ArtifactsService, ArtifactSearch],
  exports: [ArtifactSearch],
})
export class ArtifactsModule {}
