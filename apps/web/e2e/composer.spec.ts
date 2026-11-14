import { expectNoAxeViolations } from './a11y';
import { expect, matchTheme, resetUser, signIn, test } from './fixtures';

test.describe('asking Donovan', () => {
  test('the home page offers the composer and starters', async ({ page }) => {
    await signIn(page, 'alex', '/chats');
    await matchTheme(page);
    await expect(page.getByRole('heading', { level: 1, name: 'What should we work on, Alex?' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("the Brief's question arrives in the composer", async ({ page }) => {
    await signIn(page, 'alex', '/chats/new?q=What%20should%20I%20prep%3F');
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('What should I prep?');
  });

  test.describe('changing state', () => {
    test.skip(({ colorScheme }) => colorScheme !== 'light', 'state-changing; runs once');
    test.describe.configure({ mode: 'serial' });

    test('a new chat streams its answer and joins the list', async ({ page }) => {
      await signIn(page, 'priya', '/chats');
      await resetUser(page);
      await page.getByRole('textbox', { name: 'Message' }).fill('What should I prep for the 2:00 PM go/no-go?');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/chats\/[a-z0-9]{8}$/);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        'What should I prep for the 2:00 PM go/no-go?',
      );
      await expect(page.getByText('Mara asked to decide in one pass')).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Donovan answered.' })).toBeAttached();
      await expect(page.locator('tc-chat-history').getByText('What should I prep for the 2:00')).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('approving a waiting write tool runs it and Donovan says so', async ({ page }) => {
      await signIn(page, 'priya', '/chats/fraud');
      await resetUser(page);
      const card = page.locator('tc-approval-card');
      await expect(card.getByRole('heading', { name: 'Approve post_message?' })).toBeVisible();
      await expectNoAxeViolations(page);
      await card.getByRole('button', { name: 'Approve once' }).click();
      await expect(page.getByText('Done: post_message ran on Slack · #risk-ops.')).toBeVisible();
      await page.reload();
      await expect(page.locator('tc-approval-card')).toHaveCount(0);
    });

    test('denying a write tool leaves it unrun', async ({ page }) => {
      await signIn(page, 'priya', '/chats/invoice');
      await resetUser(page);
      await page.locator('tc-approval-card').getByRole('button', { name: 'Deny' }).click();
      await expect(page.getByText("I didn't run create_issue.")).toBeVisible();
    });

    test('a thumbs down asks what went wrong and is kept', async ({ page }) => {
      await signIn(page, 'priya', '/chats/churn');
      await resetUser(page);
      const actions = page.locator('tc-message-actions').first();
      await actions.getByRole('button', { name: 'Bad response' }).click();
      await actions.getByRole('button', { name: 'Not accurate' }).click();
      await actions.getByRole('button', { name: 'Send' }).click();
      await page.reload();
      await expect(
        page.locator('tc-message-actions').first().getByRole('button', { name: 'Bad response' }),
      ).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
