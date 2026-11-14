import { expectNoAxeViolations } from './a11y';
import { expect, matchTheme, resetUser, signIn, test } from './fixtures';

test.describe('Artifacts', () => {
  test('lists what chats produced and filters by kind', async ({ page }) => {
    await signIn(page, 'alex', '/artifacts');
    await matchTheme(page);
    const grid = page.getByRole('main').getByRole('list').last();
    await expect(grid.getByRole('link')).toHaveCount(7);
    await expectNoAxeViolations(page);
    await page.getByRole('radio', { name: /^Data/ }).click();
    await expect(grid.getByRole('link')).toHaveCount(2);
  });

  test('finds an artifact by what is inside it', async ({ page }) => {
    await signIn(page, 'alex', '/artifacts');
    await page.getByRole('searchbox', { name: 'Search artifacts' }).fill('break-glass');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: '1 artifact matches' })).toBeAttached();
    await expect(page.getByRole('link', { name: /approval_tiers_rfc\.md/ })).toBeVisible();
  });

  test('shows a document at each version and marks what changed', async ({ page }) => {
    await signIn(page, 'alex', '/artifacts/rollout-note-fraud-sentinel-v3-2');
    await matchTheme(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Rollout note — Fraud Sentinel v3.2' })).toBeVisible();
    await expect(page.getByText('New in v2').first()).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('radio', { name: 'v1' }).click();
    await expect(page.getByRole('heading', { name: 'Rollback trigger' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Continue in chat' })).toHaveAttribute('href', '/chats/fraud');
  });

  test('a chat links to the artifacts it made', async ({ page }) => {
    await signIn(page, 'alex', '/chats/rfc');
    await page
      .getByRole('link', { name: /Open approval_tiers_rfc\.md/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/artifacts\/approval-tiers-rfc-md$/);
  });

  test.describe('changing state', () => {
    test.skip(({ colorScheme }) => colorScheme !== 'light', 'state-changing; runs once');
    test.describe.configure({ mode: 'serial' });

    test('uploading a CSV opens it as data', async ({ page }) => {
      await signIn(page, 'sam', '/artifacts');
      await resetUser(page);
      await page.locator('input[type=file]').setInputFiles({
        name: 'regions.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('region,revenue\nEU,10\nUS,12'),
      });
      await expect(page).toHaveURL(/\/artifacts\/regions-csv-[0-9a-f]{6}$/);
      await expect(page.getByRole('heading', { level: 1, name: 'regions.csv' })).toBeVisible();
      await expect(page.getByRole('gridcell', { name: 'EU' }).or(page.getByRole('cell', { name: 'EU' }))).toBeVisible();
    });

    test("a file it can't read says why", async ({ page }) => {
      await signIn(page, 'sam', '/artifacts');
      await page
        .locator('input[type=file]')
        .setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
      await expect(page.getByText("That JSON doesn't parse").first()).toBeVisible();
    });
  });
});
