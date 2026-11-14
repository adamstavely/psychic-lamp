import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Brief, BriefQuery, MemosRead, NeedDone, UpdatesSeen } from '@donovan/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Claims } from '../auth/claims.decorator.js';
import type { Claims as TokenClaims } from '../auth/claims.js';
import { UsersService } from '../users/users.service.js';
import { BriefService } from './brief.service.js';

@ApiTags('Daily Brief')
@ApiBearerAuth()
@Controller('brief')
export class BriefController {
  constructor(
    private readonly briefs: BriefService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: Brief })
  async get(@Claims() claims: TokenClaims, @Query({ schema: BriefQuery }) query: BriefQuery): Promise<Brief> {
    return this.briefs.brief(await this.users.idFor(claims), query.tz);
  }

  @Put('needs/:id/done')
  @HttpCode(204)
  async setNeedDone(
    @Claims() claims: TokenClaims,
    @Param('id') id: string,
    @Body({ schema: NeedDone }) body: NeedDone,
  ): Promise<void> {
    await this.briefs.setNeedDone(await this.users.idFor(claims), id, body.done);
  }

  @Post('memos/read')
  @HttpCode(204)
  async markMemosRead(@Claims() claims: TokenClaims, @Body({ schema: MemosRead }) body: MemosRead): Promise<void> {
    await this.briefs.markMemosRead(await this.users.idFor(claims), body.ids);
  }

  @Delete('memos/:id/read')
  @HttpCode(204)
  async markMemoUnread(@Claims() claims: TokenClaims, @Param('id') id: string): Promise<void> {
    await this.briefs.markMemoUnread(await this.users.idFor(claims), id);
  }

  @Post('updates/seen')
  @HttpCode(204)
  async markUpdatesSeen(
    @Claims() claims: TokenClaims,
    @Body({ schema: UpdatesSeen }) body: UpdatesSeen,
  ): Promise<void> {
    await this.briefs.markUpdatesSeen(await this.users.idFor(claims), body.ids);
  }
}
