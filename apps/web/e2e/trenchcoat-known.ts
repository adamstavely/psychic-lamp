import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Trench Coat bugs Donovan works around until the release that fixes them is vendored. Each names that release; the
 * known-issues test fails once it's installed, so a workaround can't outlive its bug.
 */
export const KNOWN_TRENCHCOAT_ISSUES = {
  /** tc-stories tiles were named by aria-label, so axe's label-content-name-mismatch flagged them (WCAG 2.5.3). */
  storiesLabelInName: { fixedIn: '0.28.1', axeRule: 'label-content-name-mismatch', selector: 'tc-stories' },
  /** An icon-only tc-button's native button was 0×0, so Playwright can't press it; click the chip instead. */
  iconButtonZeroSize: { fixedIn: '0.28.1' },
} as const;

export function installedTrenchcoat(): string {
  const pkg = resolve(process.cwd(), '../../node_modules/@adamstavely/trenchcoat/package.json');
  return (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version;
}

/** True when the installed Trench Coat is `version` or later. */
export function atLeast(version: string, installed = installedTrenchcoat()): boolean {
  const a = installed.split('.').map(Number);
  const b = version.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
}
