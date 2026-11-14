import { expectNoAxeViolations } from './a11y';
import type { Page } from '@playwright/test';
import { expect, matchTheme, signIn, test } from './fixtures';

/** ⌘K's menu loads once the page is idle; a shortcut pressed before that does nothing */
const searchReady = (page: Page) => expect(page.getByRole('combobox', { name: 'Search Donovan' })).toBeVisible();

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
    await searchReady(page);
    await page.keyboard.press('ControlOrMeta+k');
    // Search results redraw the list when they land; wait for them so Enter picks the option seen.
    const answered = page.waitForResponse((r) => r.url().includes('/api/search?q=artifacts'));
    await page.keyboard.type('artifacts');
    await answered;
    await expect(page.getByRole('option', { name: /^Artifacts/ }).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveTitle('Artifacts · Donovan');
  });

  test('⌘K finds a chat by what was said in it, and an artifact by name', async ({ page }) => {
    await searchReady(page);
    await page.keyboard.press('ControlOrMeta+k');
    // The list updates as results arrive; wait for the answer to the whole query before choosing.
    const answered = page.waitForResponse((r) => r.url().includes('/api/search?q=3DS%20rollout'));
    await page.keyboard.type('3DS rollout');
    await answered;
    const result = page.getByRole('option', { name: /^Summarize support intents, Sept/ });
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/chats\/intents$/);
    await searchReady(page);
    await page.keyboard.press('ControlOrMeta+k');
    const cohort = page.waitForResponse((r) => r.url().includes('/api/search?q=cohort'));
    await page.keyboard.type('cohort');
    await cohort;
    await page.getByRole('option', { name: /^cohort\.json/ }).click();
    await expect(page).toHaveURL(/\/artifacts\/cohort-json$/);
  });

  test('Build mode: the toggle, its rail with counts, an area and an item', async ({ page }) => {
    await expect(page.getByRole('radio', { name: 'Assist' })).toBeChecked();
    await page.getByRole('radio', { name: 'Build' }).click();
    await expect(page).toHaveURL(/\/build\/skills$/);
    await expect(page.getByRole('radio', { name: 'Build' })).toBeChecked();
    const nav = page.getByRole('navigation', { name: 'Build' });
    await expect(nav.getByRole('link', { name: /^Skills/ })).toHaveAttribute('aria-current', 'page');
    // Each area shows how many items it holds.
    await expect(nav.getByRole('link', { name: /^MCP Servers\s*6$/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Chats' })).toHaveCount(0);

    await nav.getByRole('link', { name: /^MCP Servers/ }).click();
    await expect(page).toHaveTitle('MCP Servers · Donovan');
    await expectNoAxeViolations(page);
    await page.getByRole('link', { name: 'Filesystem' }).click();
    await expect(page.getByRole('heading', { name: 'Filesystem', level: 1 })).toBeVisible();
    await expect(page).toHaveTitle('Filesystem · Donovan');
    await expectNoAxeViolations(page);

    await page.getByRole('radio', { name: 'Assist' }).click();
    await expect(page).toHaveURL(/\/brief$/);
  });

  test('⌘K finds a Build area and a registry item', async ({ page }) => {
    await searchReady(page);
    await page.keyboard.press('ControlOrMeta+k');
    const answered = page.waitForResponse((r) => r.url().includes('/api/registry?q=upsert'));
    await page.keyboard.type('upsert');
    await answered;
    // A tool's name finds the server that has it.
    await page.getByRole('option', { name: /^PIM/ }).click();
    await expect(page).toHaveURL(/\/build\/servers\/pim$/);
    await expect(page.getByRole('radio', { name: 'Build' })).toBeChecked();
  });

  test('an unknown address says so', async ({ page }) => {
    await page.goto('/nowhere');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe('when the sign-in service is down', () => {
  test('says so, instead of a blank page', async ({ page }) => {
    await page.route('**/.well-known/openid-configuration', (route) => route.abort('connectionrefused'));
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: "Donovan can't reach the sign-in service" })).toBeVisible();
    await expect(page).toHaveURL(/\/unauthorized\?reason=unreachable$/);
    await expectNoAxeViolations(page);

    // Back up: Try again starts over and goes on to sign in.
    await page.unroute('**/.well-known/openid-configuration');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page).toHaveURL(/localhost:8180\/realms\/donovan\//);
  });
});
