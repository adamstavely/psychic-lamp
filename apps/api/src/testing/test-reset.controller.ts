import { Controller, Delete, HttpCode, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Claims } from '../auth/claims.decorator.js';
import type { Claims as TokenClaims } from '../auth/claims.js';
import { ArtifactSearch } from '../artifacts/artifact-search.js';
import { DB, type Db } from '../db/db.module.js';
import { users } from '../db/schema.js';

/** Only registered when ALLOW_TEST_RESET is true (see app.module.ts): never in a deployment. */
@Controller('test')
export class TestResetController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly search: ArtifactSearch,
  ) {}

  /** Deletes the caller and everything of theirs; their next request starts from the canned content again. */
  @Delete('me')
  @HttpCode(204)
  async resetMe(@Claims() claims: TokenClaims): Promise<void> {
    const [gone] = await this.db.delete(users).where(eq(users.subject, claims.sub)).returning({ id: users.id });
    if (gone) await this.search.removeOwner(gone.id);
  }
}
