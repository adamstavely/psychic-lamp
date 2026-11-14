import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { KNOWN_TRENCHCOAT_ISSUES } from './trenchcoat-known';

/** Axe findings that are Trench Coat bugs already fixed upstream (see trenchcoat-known.ts). */
const KNOWN = Object.values(KNOWN_TRENCHCOAT_ISSUES).filter(
  (i): i is Extract<typeof i, { axeRule: string }> => 'axeRule' in i,
);

/** Fails the test on any WCAG 2.2 A/AA violation axe can find on the page as it stands. */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // Full ancestry, so a known issue can be matched by the element it sits inside.
    .options({ ancestry: true })
    .analyze();
  const real = violations
    .map((v) => ({
      ...v,
      nodes: v.nodes.filter(
        (n) => !KNOWN.some((k) => k.axeRule === v.id && (n.ancestry ?? n.target).join(' ').includes(k.selector)),
      ),
    }))
    .filter((v) => v.nodes.length > 0);
  const summary = real.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  );
  expect(summary, summary.join('\n\n')).toEqual([]);
}
