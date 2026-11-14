import { expectNoAxeViolations } from './a11y';
import { expect, matchTheme, resetUser, signIn, test } from './fixtures';

test.describe('Projects', () => {
  test('lists org libraries and your projects', async ({ page }) => {
    await signIn(page, 'alex', '/projects');
    await matchTheme(page);
    await expect(page.getByRole('region', { name: /Shared with your org/ }).getByRole('listitem')).toHaveCount(4);
    await expect(page.getByRole('link', { name: /Fraud rollout/ })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('a project shows its sources, a cited guide and its chats', async ({ page }) => {
    await signIn(page, 'alex', '/projects/fraud-rollout');
    await matchTheme(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Fraud rollout' })).toBeVisible();
    await expect(page.getByRole('region', { name: /Sources/ }).getByRole('checkbox')).toHaveCount(6);
    await expect(page.locator('tc-cited-answer').first()).toContainText('shadow mode');
    await expect(page.getByRole('link', { name: 'Q4 fraud model rollout' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test.describe('changing state', () => {
    test.skip(({ colorScheme }) => colorScheme !== 'light', 'state-changing; runs once');
    test.describe.configure({ mode: 'serial' });

    test('asking cites the sources and an answer can be saved as a note', async ({ page }) => {
      await signIn(page, 'kemi', '/projects/support-triage');
      await resetUser(page);
      await page.getByRole('button', { name: 'Why did returns CSAT drop?' }).click();
      const answer = page.getByRole('region', { name: 'Why did returns CSAT drop?' });
      await expect(answer).toContainText('18% of true returns');
      await answer.getByRole('button', { name: 'Save to note' }).click();
      await expect(page.getByRole('region', { name: 'Studio' }).getByText('Why did returns CSAT drop?')).toBeVisible();
    });

    test('a source can be added and deselected', async ({ page }) => {
      await signIn(page, 'kemi', '/projects/sku-onboarding');
      await resetUser(page);
      const sources = page.getByRole('region', { name: /Sources/ });
      await sources
        .getByRole('listitem')
        .filter({ hasText: 'GS1 attribute definitions' })
        .getByRole('button', { name: 'Add' })
        .click();
      await expect(sources.getByRole('checkbox', { name: /GS1 attribute definitions/ })).toBeChecked();
      await sources.getByRole('checkbox', { name: /GS1 attribute definitions/ }).click();
      await expect(sources.getByRole('heading', { name: /4 of 5 selected/ })).toBeVisible();
    });

    test('a new project starts empty and opens', async ({ page }) => {
      await signIn(page, 'kemi', '/projects');
      await page.getByRole('button', { name: 'New project' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'New project' });
      await dialog.getByRole('textbox', { name: 'Name' }).fill('Pricing study');
      await dialog.getByRole('checkbox', { name: /Calibrated mode/ }).check();
      await dialog.getByRole('button', { name: 'Create project' }).click();
      await expect(page).toHaveURL(/\/projects\/pricing-study-[0-9a-f]{4}$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Pricing study' })).toBeVisible();
      await expect(page.getByText('No sources yet.')).toBeVisible();
    });
  });
});
