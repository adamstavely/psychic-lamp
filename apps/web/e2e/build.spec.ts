import { expectNoAxeViolations } from './a11y';
import { expect, matchTheme, signIn, test } from './fixtures';

test.describe('the Build catalog', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'alex', '/build/servers');
    await matchTheme(page);
  });

  test('shows an area as cards, each with its state, figures and actions', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Connect tools and data.', level: 1 })).toBeVisible();
    const cards = page.getByRole('list').filter({ has: page.getByRole('heading', { name: 'Filesystem' }) });
    const fs = cards.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Filesystem' }) });
    await expect(fs).toContainText('Verified');
    await expect(fs).toContainText('3 tools');
    await expect(fs.getByRole('button', { name: 'Use in chat' })).toBeVisible();
    await expectNoAxeViolations(page);

    await fs.getByRole('link', { name: 'Open Filesystem' }).click();
    await expect(page).toHaveURL(/\/build\/servers\/filesystem$/);
  });

  test('switches to a list, and between Mine, Team and All', async ({ page }) => {
    await page.getByRole('radio', { name: 'List view' }).click();
    await expect(page).toHaveURL(/view=list/);
    const table = page.getByRole('table', { name: 'MCP Servers' });
    await expect(table.getByRole('row')).toHaveCount(7); // a header and six servers
    await expect(table.getByRole('rowheader', { name: /^Salesforce/ })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('radio', { name: 'Mine' }).click();
    await expect(page).toHaveURL(/scope=mine/);
    await expect(page.getByText('Nothing in mine yet.')).toBeVisible();
    await expectNoAxeViolations(page);

    // The address keeps the view: reloading shows the same.
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Mine' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'List view' })).toBeChecked();
  });

  test('filters models by task, and uses one in a new chat', async ({ page }) => {
    await page.goto('/build/models');
    const cards = page.getByRole('main').getByRole('listitem');
    await expect(cards).toHaveCount(8);
    await page.getByRole('button', { name: /^Foundation/ }).click();
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole('button', { name: /^Foundation/ })).toHaveAttribute('aria-pressed', 'true');

    await cards
      .filter({ has: page.getByRole('heading', { name: 'claude-opus-4.1' }) })
      .getByRole('button', { name: 'Use in chat' })
      .click();
    await expect(page).toHaveURL(/\/chats\/new\?/);
    await expect(page.getByRole('textbox')).toHaveValue(/^Using claude-opus-4\.1/);
  });
});
