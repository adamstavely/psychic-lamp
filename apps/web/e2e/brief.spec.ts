import { expectNoAxeViolations } from './a11y';
import { api, expect, matchTheme, resetUser, signIn, test } from './fixtures';

test.describe('Daily Brief', () => {
  test('greets the reader and lays out their morning', async ({ page }) => {
    await signIn(page, 'alex');
    await matchTheme(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Alex\. /);
    await expect(page.getByRole('heading', { name: "Donovan's read on your queue" })).toBeVisible();
    await expect(page.getByText(/go\/no-go moved up to 2:00 PM/)).toBeVisible();
    for (const name of [
      /^Changed since yesterday/,
      /^Needs you/,
      /^New memos/,
      /^Today/,
      'Pick up where you left off',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    const today = page.getByRole('region', { name: /^Today/ });
    await expect(today.getByRole('listitem').filter({ hasText: 'Fraud Sentinel go/no-go' })).toContainText(
      'Key meeting',
    );
    await expectNoAxeViolations(page);
  });

  test('the summary chips take focus to their section', async ({ page }) => {
    await signIn(page, 'alex');
    await page.getByRole('button', { name: /meetings today/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: /^Today/ })).toBeFocused();
  });

  test('shows connected apps, and memos can be answered in Mail', async ({ page }) => {
    await signIn(page, 'alex');
    await expect(page.getByRole('region', { name: 'Connected apps' }).getByText('Mail')).toBeVisible();
    const reply = page.getByRole('link', { name: /Reply in Mail to Mara Lindqvist/ });
    await expect(reply).toHaveAttribute('href', /^mailto:\?subject=Re%3A%20Fraud%20Sentinel/);
  });

  test('items that live in Build say so instead of offering a dead link', async ({ page }) => {
    await signIn(page, 'alex');
    const need = page.getByRole('listitem').filter({ hasText: 'SKU onboarding paused' });
    await expect(need).toContainText('In Build, coming soon');
    await expect(need.getByRole('link')).toHaveCount(0);
  });

  test.describe('marks', () => {
    // These change the test user's saved state, so one browser project runs them and each undoes its change.
    test.skip(({ colorScheme }) => colorScheme !== 'light', 'state-changing; runs once');
    test.describe.configure({ mode: 'serial' });

    test('ticking a need off counts it done and keeps it after a reload', async ({ page }) => {
      await signIn(page, 'devon');
      await api(page).put('/api/brief/needs/invoice-eval/done', { done: false });
      await page.reload();
      const before = await page.getByRole('heading', { name: /^Needs you/ }).textContent();
      const open = Number(/(\d+) open/.exec(before ?? '')![1]);

      const saved = page.waitForResponse((r) => r.url().includes('/needs/invoice-eval/done'));
      await page.getByRole('checkbox', { name: /Invoice extractor v2.1 eval/ }).click();
      await expect(page.getByRole('heading', { name: /^Needs you/ })).toContainText(`${open - 1} open`);
      await saved;
      await page.reload();
      await expect(page.getByRole('checkbox', { name: /Invoice extractor v2.1 eval/ })).toBeChecked();

      await page.getByRole('checkbox', { name: /Invoice extractor v2.1 eval/ }).click();
      await expect(page.getByRole('checkbox', { name: /Invoice extractor v2.1 eval/ })).not.toBeChecked();
      await expect(page.getByRole('heading', { name: /^Needs you/ })).toContainText(`${open} open`);
    });

    test('Mark all read clears the unread memos', async ({ page }) => {
      await signIn(page, 'devon');
      const memos = ['go-no-go-moved', 'approval-tiers', 'intents-draft-2', 'routing-default'];
      const unreadAll = async () => {
        for (const id of memos) await api(page).delete(`/api/brief/memos/${id}/read`);
      };
      await unreadAll();
      await page.reload();
      await expect(page.getByRole('heading', { name: /^New memos/ })).toContainText('4 unread');

      await page.getByRole('button', { name: 'Mark all read' }).click();
      await expect(page.getByRole('heading', { name: /^New memos/ })).toContainText('0 unread');
      await expect(page.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
      await unreadAll();
    });
    test('the bell lists a waiting approval, and opening it goes to the chat', async ({ page }) => {
      await signIn(page, 'devon');
      await resetUser(page);
      await page.getByRole('button', { name: /Notifications/ }).click();
      const item = page.getByText('post_message is waiting for your approval').first();
      await expect(item).toBeVisible();
      await expectNoAxeViolations(page);
      await item.click();
      await expect(page).toHaveURL(/\/chats\/(fraud|intents)$/);
    });
  });

  test('asking about the brief starts a chat with the question', async ({ page }) => {
    await signIn(page, 'alex');
    await page.getByRole('textbox', { name: 'Ask about your brief' }).fill('What should I prep?');
    await page.getByRole('button', { name: 'Ask Donovan' }).click();
    await expect(page).toHaveURL(/\/chats\/new\?q=What%20should%20I%20prep%3F$/);

    await page.goto('/brief');
    await page.getByRole('textbox', { name: 'Ask about your brief' }).fill('And then?');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/chats\/new\?q=And%20then%3F$/);
  });
});
