import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AttachCollection,
  AttachResult,
  CollectionAttachment,
  InstallClient,
  NewInstall,
  NewRegistryItem,
  NewWorkflow,
  RegistryCounts,
  RegistryInstall,
  SpaceRun,
  SpaceRunResult,
  TryResult,
  TryTool,
  WorkflowBindings,
  WorkflowGraph,
  RegistryId,
  RegistryItem,
  RegistryKind,
  RegistryQuery,
  RegistrySummary,
} from '@donovan/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
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

  @Post()
  @HttpCode(201)
  @ApiOkResponse({ standardSchema: RegistryItem })
  async register(
    @Claims() claims: TokenClaims,
    @Body({ schema: NewRegistryItem }) body: NewRegistryItem,
  ): Promise<RegistryItem> {
    const name = claims.name ?? claims.preferred_username ?? 'Me';
    return this.registry.register(await this.users.idFor(claims), name, body);
  }

  @Post('workflows')
  @HttpCode(201)
  @ApiOkResponse({ standardSchema: RegistryItem })
  async createWorkflow(
    @Claims() claims: TokenClaims,
    @Body({ schema: NewWorkflow }) body: NewWorkflow,
  ): Promise<RegistryItem> {
    const name = claims.name ?? claims.preferred_username ?? 'Me';
    return this.registry.createWorkflow(await this.users.idFor(claims), name, body.name);
  }

  @Get('workflow-bindings')
  @ApiOkResponse({ standardSchema: WorkflowBindings })
  async workflowBindings(@Claims() claims: TokenClaims): Promise<WorkflowBindings> {
    return this.registry.workflowBindings(await this.users.idFor(claims));
  }

  @Put('workflow/:id/graph')
  @ApiOkResponse({ standardSchema: RegistryItem })
  async saveWorkflow(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: RegistryId }) id: string,
    @Body({ schema: WorkflowGraph }) body: WorkflowGraph,
  ): Promise<RegistryItem> {
    return this.registry.saveWorkflow(await this.users.idFor(claims), id, body);
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

  @Post('space/:id/run')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: SpaceRunResult })
  async runSpace(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: RegistryId }) id: string,
    @Body({ schema: SpaceRun }) body: SpaceRun,
  ): Promise<SpaceRunResult> {
    return this.registry.runSpace(await this.users.idFor(claims), id, body.input);
  }

  @Get('collection/:id/projects')
  @ApiOkResponse({ standardSchema: z.array(CollectionAttachment) })
  async attachments(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: RegistryId }) id: string,
  ): Promise<CollectionAttachment[]> {
    return this.registry.attachments(await this.users.idFor(claims), id);
  }

  @Post('collection/:id/projects')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: AttachResult })
  async attach(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: RegistryId }) id: string,
    @Body({ schema: AttachCollection }) body: AttachCollection,
  ): Promise<AttachResult> {
    return this.registry.attach(await this.users.idFor(claims), id, body.projectId);
  }

  @Delete('collection/:id/projects/:projectId')
  @ApiOkResponse({ standardSchema: z.array(CollectionAttachment) })
  async detach(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: RegistryId }) id: string,
    @Param('projectId', { schema: z.string().min(1).max(64) }) projectId: string,
  ): Promise<CollectionAttachment[]> {
    return this.registry.detach(await this.users.idFor(claims), id, projectId);
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
