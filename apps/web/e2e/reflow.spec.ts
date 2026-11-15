import { expect, signIn, test } from './fixtures';

/**
 * WCAG 1.4.4 and 1.4.10: at 200% zoom on a 1280px screen the page is 640 CSS px wide, and at 400% it's 320. Nothing
 * on the main pages may need sideways scrolling at either width – not the page, the header or a scrolling region
 * (wide tables, code and tab strips scroll inside their own boxes, which is allowed).
 */
const paths = [
  '/brief',
  '/chats',
  '/chats/new',
  '/chats/supplier',
  '/chats/supplier?artifact=rollout-note-fraud-sentinel-v3-2',
  '/artifacts',
  '/artifacts/rollout-note-fraud-sentinel-v3-2',
  '/projects',
  '/projects/fraud-rollout',
  '/build/servers/filesystem',
  '/build/agents/release',
  '/build/models/sonnet',
  '/build/datasets/txn-graph',
  '/build/spaces/fraud-explainer',
  '/build/collections/risk-fraud',
  '/build/skills/rollout',
  '/build/prompts/status',
  '/build/workflows/sku',
];

for (const width of [640, 320]) {
  for (const path of paths) {
    test(`${path} reflows at ${width}px`, async ({ page }) => {
      test.skip(test.info().project.name !== 'light', 'layout, not colour');
      await page.setViewportSize({ width, height: 800 });
      await signIn(page, 'alex', path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        const scrollers = [
          document.documentElement,
          document.querySelector<HTMLElement>('.topbar')!,
          main,
          ...main.querySelectorAll<HTMLElement>('.layout, .page, .thread, dn-session-panel, dn-artifact-pane'),
        ];
        return scrollers
          .filter((e) => e.scrollWidth > e.clientWidth + 1)
          .map((e) => `${e.tagName.toLowerCase()}.${e.className}: ${e.clientWidth} < ${e.scrollWidth}`);
      });
      expect(overflow).toEqual([]);
    });
  }
}

test('at 320px the header keeps every control, New chat by its icon', async ({ page }) => {
  test.skip(test.info().project.name !== 'light', 'layout, not colour');
  await page.setViewportSize({ width: 320, height: 800 });
  await signIn(page, 'alex', '/brief');
  for (const name of ['New chat', /Switch to (dark|light)/, /^Notifications/]) {
    await expect(page.getByRole('banner').getByRole('button', { name })).toBeInViewport({ ratio: 1 });
  }
  await expect(page.getByRole('banner').getByRole('combobox', { name: 'Search Donovan' })).toBeInViewport({ ratio: 1 });
});

test('at 320px a chat gets the whole view, and its panel follows it', async ({ page }) => {
  test.skip(test.info().project.name !== 'light', 'layout, not colour');
  await page.setViewportSize({ width: 320, height: 640 });
  await signIn(page, 'alex', '/chats/supplier?artifact=rollout-note-fraud-sentinel-v3-2');
  const page_ = await page.locator('.layout > .page').boundingBox();
  const pane = await page.locator('dn-artifact-pane').boundingBox();
  expect(page_!.height).toBeGreaterThan(400);
  expect(pane!.y).toBeGreaterThanOrEqual(page_!.y + page_!.height - 1);
});
