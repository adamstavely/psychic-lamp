import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  DecisionResult,
  GovernanceQueue,
  NewDecision,
  Policy,
  PolicyId,
  PolicyList,
  PolicyPatch,
  RegistryId,
  RegistryKind,
  Resubmit,
  ReviewHistory,
} from '@donovan/contracts';
import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Claims } from '../auth/claims.decorator.js';
import type { Claims as TokenClaims } from '../auth/claims.js';
import { rolesOf } from '../auth/roles.js';
import { UsersService } from '../users/users.service.js';
import { ADMIN_ROLE, GovernanceService } from './governance.service.js';

const nameOf = (claims: TokenClaims) => claims.name ?? claims.preferred_username ?? 'Someone';

@ApiTags('Governance')
@ApiBearerAuth()
@Controller('governance')
export class GovernanceController {
  constructor(
    private readonly governance: GovernanceService,
    private readonly users: UsersService,
  ) {}

  @Get('queue')
  @ApiOkResponse({ standardSchema: GovernanceQueue })
  async queue(@Claims() claims: TokenClaims): Promise<GovernanceQueue> {
    return this.governance.queue(await this.users.idFor(claims));
  }

  @Post('queue/:kind/:id/decisions')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: DecisionResult })
  async decide(
    @Claims() claims: TokenClaims,
    @Param('kind', { schema: RegistryKind }) kind: RegistryKind,
    @Param('id', { schema: RegistryId }) id: string,
    @Body({ schema: NewDecision }) body: NewDecision,
  ): Promise<DecisionResult> {
    return this.governance.decide(await this.users.idFor(claims), nameOf(claims), kind, id, body);
  }

  @Post('queue/:kind/:id/resubmit')
  @HttpCode(204)
  async resubmit(
    @Claims() claims: TokenClaims,
    @Param('kind', { schema: RegistryKind }) kind: RegistryKind,
    @Param('id', { schema: RegistryId }) id: string,
    @Body({ schema: Resubmit }) body: Resubmit,
  ): Promise<void> {
    await this.governance.resubmit(await this.users.idFor(claims), kind, id, body.summary);
  }

  @Get('history/:kind/:id')
  @ApiOkResponse({ standardSchema: ReviewHistory })
  async history(
    @Claims() claims: TokenClaims,
    @Param('kind', { schema: RegistryKind }) kind: RegistryKind,
    @Param('id', { schema: RegistryId }) id: string,
  ): Promise<ReviewHistory> {
    return this.governance.history(await this.users.idFor(claims), kind, id);
  }

  @Get('policies')
  @ApiOkResponse({ standardSchema: PolicyList })
  async policies(@Claims() claims: TokenClaims): Promise<PolicyList> {
    return { policies: await this.governance.policies(), canChange: rolesOf(claims).includes(ADMIN_ROLE) };
  }

  @Patch('policies/:id')
  @ApiOkResponse({ standardSchema: Policy })
  async setPolicy(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: PolicyId }) id: PolicyId,
    @Body({ schema: PolicyPatch }) body: PolicyPatch,
  ): Promise<Policy> {
    if (!rolesOf(claims).includes(ADMIN_ROLE)) throw new ForbiddenException('Only a Donovan admin can change policies');
    return this.governance.setPolicy(id, body.enabled, nameOf(claims));
  }
}
