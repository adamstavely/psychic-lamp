import { Module } from '@nestjs/common';
import { SeedModule } from '../seed/seed.module.js';
import { UsersModule } from '../users/users.module.js';
import { ChatsController } from './chats.controller.js';
import { ChatsService } from './chats.service.js';

@Module({
  imports: [UsersModule, SeedModule],
  controllers: [ChatsController],
  providers: [ChatsService],
  exports: [ChatsService],
})
export class ChatsModule {}
