import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { BriefModule } from './brief/brief.module.js';
import { ChatsModule } from './chats/chats.module.js';
import { Env } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { SearchModule } from './search/search.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: (env) => Env.parse(env) }),
    DbModule,
    SearchModule,
    AuthModule,
    UsersModule,
    BriefModule,
    ChatsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
