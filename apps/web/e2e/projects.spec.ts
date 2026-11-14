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
    await expect(
      page
        .getByRole('region', { name: /Sources/ })
        .getByRole('list')
        .getByRole('checkbox'),
    ).toHaveCount(6);
    const guide = page.getByRole('article', { name: 'Fraud rollout' });
    await expect(guide).toContainText('shadow mode');
    await guide.getByRole('button', { name: /^Source 2: / }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Source 2: / })).toBeAttached();
    await expect(page.getByRole('link', { name: 'Q4 fraud model rollout' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('an org library opens read-only, to copy', async ({ page }) => {
    await signIn(page, 'alex', '/projects');
    await page.getByRole('link', { name: 'Model risk policy library' }).click();
    await expect(page).toHaveURL(/\/projects\/libraries\/model-risk-policy$/);
    await expect(page.getByText('Read only')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Copy to your projects' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the side columns fold away and come back', async ({ page }) => {
    await signIn(page, 'alex', '/projects/fraud-rollout');
    const fold = page.getByRole('button', { name: 'Hide sources' });
    await fold.click();
    await expect(page.getByRole('button', { name: 'Show sources' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('region', { name: /Sources/ }).getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show sources' }).click();
    await expect(
      page
        .getByRole('region', { name: /Sources/ })
        .getByRole('list')
        .getByRole('checkbox'),
    ).toHaveCount(6);
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

    test('Calibrated answers label their claims, and the chat is kept until cleared', async ({ page }) => {
      await signIn(page, 'kemi', '/projects/fraud-rollout');
      await resetUser(page);
      await page.getByRole('switch', { name: 'Calibrated' }).click();
      await expect(page.getByText(/Calibrated: claims labelled/)).toBeVisible();
      await page.getByRole('button', { name: 'Summarize the threshold debate' }).click();
      const answer = page.getByRole('region', { name: 'Summarize the threshold debate' });
      await expect(answer.locator('tc-claim-answer')).toBeVisible();
      await expect(answer.getByRole('complementary', { name: 'Check before acting' })).toContainText(/Before acting/);
      await expectNoAxeViolations(page);

      await page.reload();
      await expect(page.getByRole('region', { name: 'Summarize the threshold debate' })).toBeVisible();
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByRole('region', { name: 'Summarize the threshold debate' })).toHaveCount(0);
    });

    test('a source can be added and deselected', async ({ page }) => {
      await signIn(page, 'kemi', '/projects/sku-onboarding');
      await resetUser(page);
      const sources = page.getByRole('region', { name: /Sources/ });
      await sources.getByRole('button', { name: 'Add sources' }).click();
      await sources
        .getByRole('listitem')
        .filter({ hasText: 'GS1 attribute definitions' })
        .getByRole('button', { name: 'Add' })
        .click();
      await expect(sources.getByRole('checkbox', { name: /GS1 attribute definitions/ })).toBeChecked();
      await sources.getByRole('checkbox', { name: /GS1 attribute definitions/ }).click();
      await expect(sources.getByRole('heading', { name: /4 of 5 selected/ })).toBeVisible();
    });

    test('Add sources takes a link, pasted text and a connector, and says what is wrong', async ({ page }) => {
      await signIn(page, 'kemi', '/projects/sku-onboarding');
      await resetUser(page);
      const sources = page.getByRole('region', { name: /Sources/ });
      const list = sources.getByRole('list').last();
      await sources.getByRole('button', { name: 'Add sources' }).click();
      await expectNoAxeViolations(page);

      await sources.getByRole('button', { name: /^Website or link/ }).click();
      await sources.getByRole('textbox', { name: 'Web address' }).fill('gs1.org');
      await sources.getByRole('button', { name: 'Add link' }).click();
      await expect(sources.getByRole('alert')).toHaveText(/starts with http/);
      await sources.getByRole('textbox', { name: 'Web address' }).fill('https://www.gs1.org/standards/gdsn');
      await sources.getByRole('button', { name: 'Add link' }).click();
      await expect(list.getByRole('checkbox', { name: /gs1\.org\/standards\/gdsn/ })).toBeChecked();

      await sources.getByRole('button', { name: 'Add sources' }).click();
      await sources.getByRole('button', { name: /^Paste text/ }).click();
      await sources.getByRole('textbox', { name: 'Title' }).fill('Merch call notes');
      await sources.getByRole('textbox', { name: 'Text' }).fill('Pack size belongs in net content, not the title.');
      await sources.getByRole('button', { name: 'Add text' }).click();
      await expect(list.getByRole('checkbox', { name: /Merch call notes/ })).toBeChecked();

      await sources.getByRole('button', { name: 'Add sources' }).click();
      await sources.getByRole('button', { name: /^MCP connector/ }).click();
      await sources.getByRole('button', { name: 'Add Jira' }).click();
      await expect(list.getByRole('checkbox', { name: /^Jira/ })).toBeChecked();
    });

    test('a connector search finds connectors and datasets, and marks what was added', async ({ page }) => {
      await signIn(page, 'kemi', '/projects/support-triage');
      await resetUser(page);
      const sources = page.getByRole('region', { name: /Sources/ });
      await sources.getByRole('textbox', { name: 'What to look for' }).fill('support tickets');
      for (let i = 0; i < 3; i++) await sources.getByRole('button', { name: /^Where to look/ }).click();
      await expect(sources.getByRole('button', { name: 'Where to look: Connectors' })).toBeVisible();
      await sources.getByRole('button', { name: 'Search', exact: true }).click();
      const found = sources
        .getByRole('list', { name: 'Search results' })
        .getByRole('listitem')
        .filter({ hasText: 'Support tickets 2026' });
      await found.getByRole('button', { name: /^Add/ }).click();
      await expect(found).toContainText('Added');
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

    test('a search finds sources to add, and Select all clears and restores them', async ({ page }) => {
      await signIn(page, 'kemi', '/projects/fraud-rollout');
      await resetUser(page);
      const sources = page.getByRole('region', { name: /Sources/ });
      await sources.getByRole('textbox', { name: 'What to look for' }).fill('chargebacks');
      await sources.getByRole('button', { name: /^How hard to look/ }).click();
      await expect(sources.getByRole('button', { name: 'How hard to look: Deep research' })).toBeVisible();
      await sources.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: /^Found \d+ of 120 looked at\.$/ })).toBeAttached();
      await sources.getByRole('button', { name: 'Add all' }).click();
      await expect(sources.getByRole('checkbox', { name: /Chargebacks: research report/ })).toBeChecked();
      await sources.getByRole('checkbox', { name: 'Select all sources' }).click();
      await expect(sources.getByRole('heading', { name: /0 of \d+ selected/ })).toBeVisible();
      await sources.getByRole('checkbox', { name: 'Select all sources' }).click();
      await expect(sources.getByRole('heading', { name: /(\d+) of \1 selected/ })).toBeVisible();
    });

    test('a Studio tool makes an artifact filed under the project', async ({ page }) => {
      await signIn(page, 'kemi', '/projects/support-triage');
      await resetUser(page);
      const studio = page.getByRole('region', { name: 'Studio' });
      await studio.getByRole('button', { name: 'Data table' }).click();
      const made = studio.getByRole('link', { name: 'Data table — Support triage' });
      await expect(made).toBeVisible();
      await made.click();
      await expect(page.getByRole('heading', { level: 1, name: 'Data table — Support triage' })).toBeVisible();
    });

    test('notes can be written and edited, and a slide deck is made', async ({ page }) => {
      await signIn(page, 'kemi', '/projects/sku-onboarding');
      await resetUser(page);
      const studio = page.getByRole('region', { name: 'Studio' });
      await studio.getByRole('button', { name: 'Add note' }).click();
      await expect(studio.getByRole('textbox', { name: 'New note' })).toBeFocused();
      await page.keyboard.type('Ask Merch about pack sizes');
      await studio.getByRole('button', { name: 'Save note' }).click();
      await expect(studio.getByText('Ask Merch about pack sizes')).toBeVisible();
      await studio.getByRole('button', { name: 'Edit note' }).click();
      await studio.getByRole('textbox', { name: 'Edit note' }).fill('Ask Merch about pack sizes by Friday');
      await studio.getByRole('button', { name: 'Save note' }).click();
      await expect(studio.getByText('Ask Merch about pack sizes by Friday')).toBeVisible();

      await studio.getByRole('button', { name: 'Slide deck' }).click();
      await expect(studio.getByRole('link', { name: /Slide deck — SKU onboarding/ })).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('sharing with a team shows on the project', async ({ page }) => {
      await signIn(page, 'kemi', '/projects/sku-onboarding');
      await resetUser(page);
      await page.getByRole('button', { name: 'Share' }).click();
      const dialog = page.getByRole('dialog', { name: /Share SKU onboarding/ });
      await expect(dialog).toBeVisible();
      await expectNoAxeViolations(page);
      const box = dialog.getByRole('combobox').first();
      await box.fill('Risk Ops');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await dialog
        .getByRole('button', { name: /^Share/ })
        .last()
        .click();
      await expect(page.getByText('Shared with 1')).toBeVisible();
    });

    test('an artifact can be saved to a project from its page', async ({ page }) => {
      await signIn(page, 'kemi', '/artifacts/churn-compare-csv');
      await resetUser(page);
      await page.getByRole('button', { name: 'Save to project' }).click();
      const dialog = page.getByRole('dialog', { name: 'Save to project' });
      await dialog.getByRole('combobox', { name: 'Project' }).selectOption({ label: 'Supplier risk' });
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Saved to Supplier risk').first()).toBeVisible();
      await page.goto('/projects/supplier-risk');
      await expect(
        page.getByRole('region', { name: 'Studio' }).getByRole('link', { name: 'churn_compare.csv' }),
      ).toBeVisible();
    });
  });
});
