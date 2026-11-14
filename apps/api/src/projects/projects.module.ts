import { Module } from '@nestjs/common';
import { ChatsModule } from '../chats/chats.module.js';
import { SeedModule } from '../seed/seed.module.js';
import { UsersModule } from '../users/users.module.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [UsersModule, SeedModule, ChatsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
