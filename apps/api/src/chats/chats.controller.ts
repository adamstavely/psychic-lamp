import {
  type Chat,
  ChatPatch,
  type ChatSummary,
  NewChat,
  SendMessage,
  ToolDecision,
  type ToolDecisionResult,
  Vote,
} from '@donovan/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Claims } from '../auth/claims.decorator.js';
import type { Claims as TokenClaims } from '../auth/claims.js';
import { UsersService } from '../users/users.service.js';
import type { Env } from '../config/env.js';
import { ChatsService } from './chats.service.js';
import { sse, streamAnswer } from './stream.js';

export const ChatId = z.string().regex(/^[a-z0-9-]{1,64}$/, 'Not a chat id');
const ToolId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Not a tool call id');

@Controller('chats')
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post()
  async create(@Claims() claims: TokenClaims, @Body({ schema: NewChat }) body: NewChat): Promise<ChatSummary> {
    return this.chats.create(await this.users.idFor(claims), body);
  }

  /**
   * Sends a message and streams the answer as server-sent events (StreamEvent). It's a POST, so the browser reads it
   * with fetch rather than EventSource, and the bearer token goes in the header as for every other call.
   */
  @Post(':id/messages')
  async send(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: ChatId }) id: string,
    @Body({ schema: SendMessage }) body: SendMessage,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Saved before streaming starts, so leaving mid-answer still leaves a whole thread behind.
    const { user, answer } = await this.chats.send(await this.users.idFor(claims), id, body);
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const left = new AbortController();
    req.on('close', () => left.abort());
    res.write(sse({ type: 'user', message: user }));
    for await (const event of streamAnswer(answer, this.config.get('STREAM_SPEED', { infer: true }), left.signal)) {
      res.write(sse(event));
    }
    res.end();
  }

  @Post(':id/tools/:toolId/decision')
  async decide(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: ChatId }) id: string,
    @Param('toolId', { schema: ToolId }) toolId: string,
    @Body({ schema: ToolDecision }) body: ToolDecision,
  ): Promise<ToolDecisionResult> {
    return this.chats.decide(await this.users.idFor(claims), id, toolId, body);
  }

  @Put(':id/messages/:messageId/vote')
  @HttpCode(204)
  async vote(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: ChatId }) id: string,
    @Param('messageId', { schema: z.uuid() }) messageId: string,
    @Body({ schema: Vote }) body: Vote,
  ): Promise<void> {
    await this.chats.vote(await this.users.idFor(claims), id, messageId, body);
  }

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
