import { Module } from '@nestjs/common';
import { BriefModule } from '../brief/brief.module.js';
import { ChatsModule } from '../chats/chats.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [UsersModule, BriefModule, ChatsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
