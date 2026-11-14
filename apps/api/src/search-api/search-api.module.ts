import { Module } from '@nestjs/common';
import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { ChatsModule } from '../chats/chats.module.js';
import { SeedModule } from '../seed/seed.module.js';
import { UsersModule } from '../users/users.module.js';
import { SearchBackfill } from './search-backfill.js';
import { SearchController } from './search.controller.js';

@Module({
  imports: [UsersModule, ChatsModule, ArtifactsModule, SeedModule],
  controllers: [SearchController],
  providers: [SearchBackfill],
})
export class SearchApiModule {}
