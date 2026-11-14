import { expect, test } from '@playwright/test';
import { atLeast, installedTrenchcoat, KNOWN_TRENCHCOAT_ISSUES } from './trenchcoat-known';

test('every Trench Coat workaround is still needed by the installed release', () => {
  const installed = installedTrenchcoat();
  const outlived = Object.entries(KNOWN_TRENCHCOAT_ISSUES)
    .filter(([, issue]) => issue.fixedIn !== null && atLeast(issue.fixedIn, installed))
    .map(([name, issue]) => `${name} (fixed in ${issue.fixedIn})`);
  expect(outlived, `Trench Coat ${installed} fixes these; remove their workarounds`).toEqual([]);
});
