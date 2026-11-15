import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  InstallClient,
  NewInstall,
  RegistryCounts,
  RegistryInstall,
  TryResult,
  TryTool,
  RegistryId,
  RegistryItem,
  RegistryKind,
  RegistryQuery,
  RegistrySummary,
} from '@donovan/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Claims } from '../auth/claims.decorator.js';
import type { Claims as TokenClaims } from '../auth/claims.js';
import { UsersService } from '../users/users.service.js';
import { RegistryService } from './registry.service.js';

@ApiTags('Registry')
@ApiBearerAuth()
@Controller('registry')
export class RegistryController {
  constructor(
    private readonly registry: RegistryService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: z.array(RegistrySummary) })
  async list(
    @Claims() claims: TokenClaims,
    @Query({ schema: RegistryQuery }) query: RegistryQuery,
  ): Promise<RegistrySummary[]> {
    return this.registry.list(await this.users.idFor(claims), query);
  }

  @Get('counts')
  @ApiOkResponse({ standardSchema: RegistryCounts })
  async counts(@Claims() claims: TokenClaims): Promise<RegistryCounts> {
    return this.registry.counts(await this.users.idFor(claims));
  }

  @Post('server/:id/tools/:tool/try')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: TryResult })
  async tryTool(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: RegistryId }) id: string,
    @Param('tool', { schema: z.string().min(1).max(120) }) tool: string,
    @Body({ schema: TryTool }) body: TryTool,
  ): Promise<TryResult> {
    return this.registry.tryTool(await this.users.idFor(claims), id, tool, body.args);
  }

  @Get(':kind/:id/installs')
  @ApiOkResponse({ standardSchema: z.array(RegistryInstall) })
  async installs(
    @Claims() claims: TokenClaims,
    @Param('kind', { schema: RegistryKind }) kind: RegistryKind,
    @Param('id', { schema: RegistryId }) id: string,
  ): Promise<RegistryInstall[]> {
    return this.registry.installs(await this.users.idFor(claims), kind, id);
  }

  @Post(':kind/:id/installs')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: z.array(RegistryInstall) })
  async install(
    @Claims() claims: TokenClaims,
    @Param('kind', { schema: RegistryKind }) kind: RegistryKind,
    @Param('id', { schema: RegistryId }) id: string,
    @Body({ schema: NewInstall }) body: NewInstall,
  ): Promise<RegistryInstall[]> {
    return this.registry.install(await this.users.idFor(claims), kind, id, body.client);
  }

  @Delete(':kind/:id/installs/:client')
  @ApiOkResponse({ standardSchema: z.array(RegistryInstall) })
  async uninstall(
    @Claims() claims: TokenClaims,
    @Param('kind', { schema: RegistryKind }) kind: RegistryKind,
    @Param('id', { schema: RegistryId }) id: string,
    @Param('client', { schema: InstallClient }) client: InstallClient,
  ): Promise<RegistryInstall[]> {
    return this.registry.uninstall(await this.users.idFor(claims), kind, id, client);
  }

  @Get(':kind/:id')
  @ApiOkResponse({ standardSchema: RegistryItem })
  async get(
    @Claims() claims: TokenClaims,
    @Param('kind', { schema: RegistryKind }) kind: RegistryKind,
    @Param('id', { schema: RegistryId }) id: string,
  ): Promise<RegistryItem> {
    return this.registry.get(await this.users.idFor(claims), kind, id);
  }
}
