import { type Chat, ChatPatch, type ChatSummary } from '@donovan/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Claims } from '../auth/claims.decorator.js';
import type { Claims as TokenClaims } from '../auth/claims.js';
import { UsersService } from '../users/users.service.js';
import { ChatsService } from './chats.service.js';

export const ChatId = z.string().regex(/^[a-z0-9-]{1,64}$/, 'Not a chat id');

@Controller('chats')
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  async list(@Claims() claims: TokenClaims): Promise<ChatSummary[]> {
    return this.chats.list(await this.users.idFor(claims));
  }

  @Get(':id')
  async get(@Claims() claims: TokenClaims, @Param('id', { schema: ChatId }) id: string): Promise<Chat> {
    return this.chats.get(await this.users.idFor(claims), id);
  }

  @Patch(':id')
  async update(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: ChatId }) id: string,
    @Body({ schema: ChatPatch }) patch: ChatPatch,
  ): Promise<ChatSummary> {
    return this.chats.update(await this.users.idFor(claims), id, patch);
  }

  @Delete(':id')
  @HttpCode(204)
  async archive(@Claims() claims: TokenClaims, @Param('id', { schema: ChatId }) id: string): Promise<void> {
    await this.chats.archive(await this.users.idFor(claims), id);
  }

  @Post(':id/restore')
  @HttpCode(204)
  async restore(@Claims() claims: TokenClaims, @Param('id', { schema: ChatId }) id: string): Promise<void> {
    await this.chats.restore(await this.users.idFor(claims), id);
  }
}
