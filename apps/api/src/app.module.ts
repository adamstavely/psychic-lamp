import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ArtifactsModule } from './artifacts/artifacts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BriefModule } from './brief/brief.module.js';
import { ChatsModule } from './chats/chats.module.js';
import { Env } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { SearchApiModule } from './search-api/search-api.module.js';
import { SearchModule } from './search/search.module.js';
import { TestResetController } from './testing/test-reset.controller.js';
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
    ArtifactsModule,
    ProjectsModule,
    SearchApiModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {
  /** The app, plus the end-to-end test reset when the environment allows it. */
  static forEnvironment(env: NodeJS.ProcessEnv = process.env): DynamicModule {
    const allowReset = Env.shape.ALLOW_TEST_RESET.parse(env['ALLOW_TEST_RESET']);
    return { module: AppModule, imports: [ArtifactsModule], controllers: allowReset ? [TestResetController] : [] };
  }
}
