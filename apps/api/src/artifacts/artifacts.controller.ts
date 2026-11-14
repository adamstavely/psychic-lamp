import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Artifact, ArtifactPatch, ArtifactQuery, ArtifactSummary, ArtifactUpload } from '@donovan/contracts';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Claims } from '../auth/claims.decorator.js';
import type { Claims as TokenClaims } from '../auth/claims.js';
import { identityFrom } from '../users/identity.js';
import { UsersService } from '../users/users.service.js';
import { ArtifactsService } from './artifacts.service.js';

const ArtifactId = z.string().regex(/^[a-z0-9-]{1,80}$/, 'Not an artifact id');

@ApiTags('Artifacts')
@ApiBearerAuth()
@Controller('artifacts')
export class ArtifactsController {
  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: z.array(ArtifactSummary) })
  async list(
    @Claims() claims: TokenClaims,
    @Query({ schema: ArtifactQuery }) query: ArtifactQuery,
  ): Promise<ArtifactSummary[]> {
    return this.artifacts.list(await this.users.idFor(claims), query);
  }

  @Get(':id')
  @ApiOkResponse({ standardSchema: Artifact })
  async get(@Claims() claims: TokenClaims, @Param('id', { schema: ArtifactId }) id: string): Promise<Artifact> {
    return this.artifacts.get(await this.users.idFor(claims), id, identityFrom(claims).name);
  }

  @Post()
  @ApiOkResponse({ standardSchema: ArtifactSummary })
  async upload(
    @Claims() claims: TokenClaims,
    @Body({ schema: ArtifactUpload }) body: ArtifactUpload,
  ): Promise<ArtifactSummary> {
    return this.artifacts.upload(await this.users.idFor(claims), body);
  }

  @Patch(':id')
  @ApiOkResponse({ standardSchema: ArtifactSummary })
  async setProject(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: ArtifactId }) id: string,
    @Body({ schema: ArtifactPatch }) body: ArtifactPatch,
  ): Promise<ArtifactSummary> {
    return this.artifacts.setProject(await this.users.idFor(claims), id, body);
  }
}
