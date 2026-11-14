import { expect, signIn, test } from './fixtures';

/**
 * WCAG 1.4.4 and 1.4.10: at 200% zoom on a 1280–1440px screen the page is 640–720 CSS px wide. Nothing on the main
 * pages may need sideways scrolling there (wide tables and code scroll inside their own boxes, which is allowed).
 */
for (const path of [
  '/brief',
  '/chats',
  '/chats/supplier',
  '/artifacts',
  '/artifacts/rollout-note-fraud-sentinel-v3-2',
  '/projects',
  '/projects/fraud-rollout',
]) {
  test(`${path} reflows at 640px`, async ({ page }) => {
    test.skip(test.info().project.name !== 'light', 'layout, not colour');
    await page.setViewportSize({ width: 640, height: 900 });
    await signIn(page, 'alex', path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const scrollers = [main, ...main.querySelectorAll<HTMLElement>('.page, .layout > .page, .thread')];
      return scrollers
        .filter((e) => e.scrollWidth > e.clientWidth + 1)
        .map((e) => `${e.className}: ${e.clientWidth} < ${e.scrollWidth}`);
    });
    expect(overflow).toEqual([]);
  });
}
