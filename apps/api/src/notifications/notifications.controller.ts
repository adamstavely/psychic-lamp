import { z } from 'zod';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BriefQuery, Notification, NotificationDismiss, NotificationsRead } from '@donovan/contracts';
import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Claims } from '../auth/claims.decorator.js';
import type { Claims as TokenClaims } from '../auth/claims.js';
import { UsersService } from '../users/users.service.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: z.array(Notification) })
  async list(@Claims() claims: TokenClaims, @Query({ schema: BriefQuery }) query: BriefQuery): Promise<Notification[]> {
    return this.notifications.list(await this.users.idFor(claims), query.tz);
  }

  @Post('read')
  @HttpCode(204)
  async read(
    @Claims() claims: TokenClaims,
    @Body({ schema: NotificationsRead }) body: NotificationsRead,
  ): Promise<void> {
    await this.notifications.markRead(await this.users.idFor(claims), body);
  }

  @Post('dismiss')
  @HttpCode(204)
  async dismiss(
    @Claims() claims: TokenClaims,
    @Body({ schema: NotificationDismiss }) body: NotificationDismiss,
  ): Promise<void> {
    await this.notifications.dismiss(await this.users.idFor(claims), body.id);
  }
}
