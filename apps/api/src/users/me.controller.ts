import { type Me, type Preferences, PreferencesPatch } from '@donovan/contracts';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Claims } from '../auth/claims.decorator.js';
import type { Claims as TokenClaims } from '../auth/claims.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@Claims() claims: TokenClaims): Promise<Me> {
    return this.users.me(claims);
  }

  @Get('preferences')
  async preferences(@Claims() claims: TokenClaims): Promise<Preferences> {
    const me = await this.users.me(claims);
    return this.users.preferences(me.id);
  }

  @Patch('preferences')
  async updatePreferences(
    @Claims() claims: TokenClaims,
    @Body({ schema: PreferencesPatch }) patch: PreferencesPatch,
  ): Promise<Preferences> {
    const me = await this.users.me(claims);
    return this.users.updatePreferences(me.id, patch);
  }
}
