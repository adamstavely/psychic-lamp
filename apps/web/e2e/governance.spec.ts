import type { Browser, Page } from '@playwright/test';
import { expectNoAxeViolations } from './a11y';
import { api, expect, matchTheme, resetUser, signIn, test, type USERS } from './fixtures';

/** Someone else, in a browser of their own. */
async function as(browser: Browser, user: keyof typeof USERS, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, user, path);
  return page;
}

/** Registers a model as the signed-in person, through the API (the wizard has its own test). */
async function submit(page: Page, name: string): Promise<{ id: string }> {
  const res = await api(page).post('/api/registry', {
    kind: 'model',
    name,
    summary: 'Scores churn risk.',
    team: null,
    sensitivity: 'Internal',
    access: { readOnly: true, approval: true, internalOnly: false, audit: true },
    task: 'Classification',
    framework: 'PyTorch',
    base: 'XGBoost',
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string };
}

test.describe('Governance', () => {
  test('the queue, the policies a non-admin can only read, and the tiers', async ({ page }) => {
    await signIn(page, 'mara', '/build/governance');
    await matchTheme(page);
    await expect(page.getByRole('heading', { name: 'Review, policies and tiers.' })).toBeVisible();
    const invoice = page.getByRole('group', { name: 'Review Vendor invoice audit' });
    await expect(invoice.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('tab', { name: 'Policies' }).click();
    await expect(page).toHaveURL(/tab=policies/);
    await expect(page.getByText('Only a Donovan admin can change these.')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Per-tool approval' })).toBeDisabled();
    await expectNoAxeViolations(page);

    await page.getByRole('tab', { name: 'Tiers' }).click();
    await expect(page.getByRole('table', { name: 'Sensitivity tiers' })).toContainText('Named approvers');
  });

  test('a Donovan admin can change policies', async ({ page }) => {
    await signIn(page, 'alex', '/build/governance?tab=policies');
    await expect(page.getByRole('switch', { name: 'Per-tool approval' })).toBeEnabled();
    await expect(page.getByText('Only a Donovan admin can change these.')).toHaveCount(0);
  });

  test.describe('changing state', () => {
    test.skip(({ colorScheme }) => colorScheme !== 'light', 'state-changing; runs once');
    test.describe.configure({ mode: 'serial' });

    test('two approvals from people other than the submitter publish a submission', async ({ page, browser }) => {
      await signIn(page, 'devon', '/build/models');
      await resetUser(page);
      const name = `Churn scorer ${Date.now()}`;
      const { id } = await submit(page, name);

      await page.goto('/build/governance');
      await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText(
        'Your submission: other people review it.',
      );

      for (const [user, after] of [
        ['sam', `Approved ${name}: 1 of 2`],
        ['kemi', `Published ${name}`],
      ] as const) {
        const reviewer = await as(browser, user, '/build/governance');
        await reviewer
          .getByRole('group', { name: `Review ${name}` })
          .getByRole('button', { name: 'Approve' })
          .click();
        await expect(reviewer.getByText(after).first()).toBeVisible();
        await reviewer.context().close();
      }

      await page.goto(`/build/models/${id}`);
      await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
      await expect(page.getByRole('region', { name: /review/i })).toHaveCount(0);
      await expect(page.getByRole('tabpanel', { name: 'Card' })).toContainText('No metrics yet.');
      await resetUser(page);
    });

    test('a request for changes says why, and the submitter resubmits for a new round', async ({ page, browser }) => {
      await signIn(page, 'devon', '/build/models');
      await resetUser(page);
      const name = `Demand model ${Date.now()}`;
      const { id } = await submit(page, name);

      const reviewer = await as(browser, 'sam', '/build/governance');
      await reviewer
        .getByRole('group', { name: `Review ${name}` })
        .getByRole('button', { name: 'Request changes' })
        .click();
      const dialog = reviewer.getByRole('dialog', { name: `Request changes to ${name}` });
      await dialog.getByRole('textbox', { name: 'Why' }).fill('Add its evals first.');
      await expectNoAxeViolations(reviewer);
      await dialog.getByRole('button', { name: 'Send back' }).click();
      await expect(reviewer.getByText(`Sent ${name} back for changes`).first()).toBeVisible();
      await reviewer.context().close();

      await page.goto(`/build/models/${id}`);
      await expect(page.getByText("You can use it in chat once it's published.")).toBeVisible();
      await expect(page.getByRole('button', { name: 'Use in chat' })).toHaveCount(0);
      const review = page.getByRole('region', { name: 'Changes requested' });
      await expect(review).toContainText('asked for changes');
      await expect(review).toContainText('Add its evals first.');
      await expectNoAxeViolations(page);
      await review.getByRole('textbox', { name: 'Summary' }).fill('Scores churn risk, with its evals.');
      await review.getByRole('button', { name: 'Resubmit for review' }).click();
      await expect(page.getByRole('region', { name: 'Waiting for review' })).toContainText('Round 2: 0 of 2');
      await resetUser(page);
    });
  });
});
