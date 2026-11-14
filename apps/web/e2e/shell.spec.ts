import { expectNoAxeViolations } from './a11y';
import { expect, matchTheme, signIn, test } from './fixtures';

test.describe('the frame around every page', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'alex');
    await matchTheme(page);
  });

  test('opens on the Daily Brief with the landmarks a screen reader needs', async ({ page }) => {
    await expect(page).toHaveURL(/\/brief$/);
    await expect(page).toHaveTitle('Daily Brief · Donovan');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Assist' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Alex');
    await expect(page.getByRole('button', { name: /Account: Alex Morgan/ })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the first Tab stop skips to the main content', async ({ page }) => {
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('the rail moves between areas and marks the current one', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Assist' });
    await nav.getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveTitle('Projects · Donovan');
    await expect(nav.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
  });

  test('⌘K finds an area and goes there', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('artifacts');
    await expect(page.getByRole('option', { name: /^Artifacts/ }).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveTitle('Artifacts · Donovan');
  });

  test('⌘K finds a chat by what was said in it, and an artifact by name', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    // The list updates as results arrive; wait for the answer to the whole query before choosing.
    const answered = page.waitForResponse((r) => r.url().includes('/api/search?q=3DS%20rollout'));
    await page.keyboard.type('3DS rollout');
    await answered;
    const result = page.getByRole('option', { name: /^Summarize support intents, Sept/ });
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/chats\/intents$/);
    await page.keyboard.press('ControlOrMeta+k');
    const cohort = page.waitForResponse((r) => r.url().includes('/api/search?q=cohort'));
    await page.keyboard.type('cohort');
    await cohort;
    await page.getByRole('option', { name: /^cohort\.json/ }).click();
    await expect(page).toHaveURL(/\/artifacts\/cohort-json$/);
  });

  test('Build mode is shown but cannot be picked yet', async ({ page }) => {
    await expect(page.getByRole('radio', { name: 'Build, coming soon' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Assist' })).toBeChecked();
  });

  test('an unknown address says so', async ({ page }) => {
    await page.goto('/nowhere');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
