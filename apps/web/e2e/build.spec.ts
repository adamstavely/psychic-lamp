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

test.describe('server and agent pages', () => {
  test('a server lists its tools, and a tool can be tried in the sandbox', async ({ page }) => {
    await signIn(page, 'alex', '/build/servers/filesystem');
    await matchTheme(page);
    await expect(page.getByRole('heading', { name: 'Filesystem', level: 1 })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Parameters of write_file' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Try read_file' }).click();
    const dialog = page.getByRole('dialog', { name: 'Try read_file' });
    await dialog.getByRole('button', { name: 'Run tool' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Fill in path');
    await dialog.getByRole('textbox', { name: /path/ }).fill('fraud/q4-plan.md');
    await dialog.getByRole('button', { name: 'Run tool' }).click();
    await expect(dialog.getByRole('status')).toContainText('200 OK');
    await expect(dialog).toContainText('"path": "fraud/q4-plan.md"');
    await expectNoAxeViolations(page);
  });

  test("a server's overview and install tabs say how it's reached and added", async ({ page }) => {
    await signIn(page, 'alex', '/build/servers/filesystem');
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Calls run through the Donovan gateway');
    await page.getByRole('tab', { name: 'Install' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('donovan servers add anthropic/filesystem@v0.9.4');
  });

  test('an agent links what it is built from, and Run in chat starts a chat with its model', async ({ page }) => {
    await signIn(page, 'alex', '/build/agents/release');
    await matchTheme(page);
    await expect(page.getByRole('heading', { name: 'Release captain', level: 1 })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('link', { name: 'GitHub' }).click();
    await expect(page).toHaveURL(/\/build\/servers\/github$/);
    await page.goBack();
    await page.getByRole('button', { name: 'Run in chat' }).click();
    await expect(page).toHaveURL(/\/chats\/new\?q=Run%20the%20Release%20captain%20agent/);
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('Run the Release captain agent: ');
    await expect(page.locator('tc-chat-composer').getByRole('button', { name: /Claude Sonnet 4\.5/ })).toBeVisible();
  });

  test.describe('changing state', () => {
    test.skip(({ colorScheme }) => colorScheme !== 'light', 'state-changing; runs once');

    test('installing a server in a client is kept, and can be taken out', async ({ page }) => {
      await signIn(page, 'devon', '/build/servers/filesystem');
      await page
        .getByRole('complementary', { name: 'About this server' })
        .getByRole('button', { name: 'Install in a client' })
        .click();
      const dialog = page.getByRole('dialog', { name: 'Install Filesystem' });
      await dialog.getByRole('radio', { name: 'Cursor' }).check();
      await expect(dialog).toContainText('"filesystem"');
      await expectNoAxeViolations(page);
      await dialog.getByRole('button', { name: 'Install' }).click();
      await expect(dialog).toBeHidden();

      await page.reload();
      await page.getByRole('tab', { name: 'Install' }).click();
      const remove = page.getByRole('button', { name: 'Remove from Cursor' });
      await expect(remove).toBeVisible();
      await remove.click();
      await expect(remove).toBeHidden();
    });
  });
});
