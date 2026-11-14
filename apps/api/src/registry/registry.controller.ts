import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  RegistryCounts,
  RegistryId,
  RegistryItem,
  RegistryKind,
  RegistryQuery,
  RegistrySummary,
} from '@donovan/contracts';
import { Controller, Get, Param, Query } from '@nestjs/common';
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
