import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Fails the test on any WCAG 2.2 A/AA violation axe can find on the page as it stands. */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  );
  expect(summary, summary.join('\n\n')).toEqual([]);
}
