import { expectNoAxeViolations } from './a11y';
import { expect, matchTheme, resetUser, signIn, test } from './fixtures';

test.describe('the session panel', () => {
  test('opens beside a Calibrated chat with its intent and claims', async ({ page }) => {
    await signIn(page, 'alex', '/chats/supplier');
    await matchTheme(page);
    const panel = page.getByRole('complementary', { name: 'Session panel' });
    await expect(panel.getByRole('heading', { name: 'Claims' })).toBeVisible();
    await expect(panel.getByText(/0 confirmed · 0 disputed · \d+ unresolved|\d+ confirmed/)).toBeVisible();
    await expect(page.locator('tc-reflection-gate')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('is closed on a standard chat until opened, and shows metadata', async ({ page }) => {
    await signIn(page, 'alex', '/chats/fraud');
    await expect(page.getByRole('complementary', { name: 'Session panel' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Session panel' }).click();
    const panel = page.getByRole('complementary', { name: 'Session panel' });
    await panel.getByRole('tab', { name: 'Metadata' }).click();
    await expect(panel.getByText('Standard')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Export with provenance' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test.describe('changing state', () => {
    test.skip(({ colorScheme }) => colorScheme !== 'light', 'state-changing; runs once');
    test.describe.configure({ mode: 'serial' });

    test('confirming a claim counts it and keeps it', async ({ page }) => {
      await signIn(page, 'mara', '/chats/supplier');
      await resetUser(page);
      const panel = page.getByRole('complementary', { name: 'Session panel' });
      const first = panel.getByRole('group', { name: 'Your verdict on: Processing concentration' });
      // The verdict shows at once; wait for it to be saved before reloading.
      const saved = page.waitForResponse(
        (r) => r.url().includes('/claims/c1/review') && r.request().method() === 'PUT',
      );
      await first.getByRole('button', { name: 'Confirm' }).click();
      await saved;
      await expect(first.getByRole('button', { name: 'Confirm' })).toHaveAttribute('aria-pressed', 'true');
      await expect(panel.getByText(/1 confirmed · /)).toBeVisible();
      await page.reload();
      await expect(
        page
          .getByRole('group', { name: 'Your verdict on: Processing concentration' })
          .getByRole('button', { name: 'Confirm' }),
      ).toHaveAttribute('aria-pressed', 'true');
    });

    test('the checkpoint records which claim will be verified, and how', async ({ page }) => {
      await signIn(page, 'mara', '/chats/supplier');
      await resetUser(page);
      const gate = page.locator('tc-reflection-gate');
      await gate.getByRole('radio', { name: /Western capacity timeline/ }).check();
      await gate
        .getByRole('textbox', { name: /How will you check it/ })
        .fill('Ask MP Materials IR for their 2027 schedule');
      await gate.getByRole('button', { name: /Continue|Submit|Done/ }).click();
      await expect(page.getByRole('note').filter({ hasText: 'Ask MP Materials IR' })).toBeVisible();
    });

    test('a chat started Calibrated labels its claims, takes an intent, and can be turned off', async ({ page }) => {
      await signIn(page, 'mara', '/chats');
      await resetUser(page);
      await page.getByRole('switch', { name: 'Calibrated' }).check();
      await page.getByRole('textbox', { name: 'Message' }).fill('What should I prep for the 2:00 PM go/no-go?');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/chats\/[a-z0-9]{8}$/);
      const panel = page.getByRole('complementary', { name: 'Session panel' });
      await expect(panel.getByRole('switch', { name: 'Calibrated' })).toBeChecked();
      await expect(panel.getByText(/0 confirmed · 0 disputed · [1-9]\d* unresolved/)).toBeVisible();

      await panel.getByRole('button', { name: 'Set intent' }).click();
      await panel.getByRole('textbox', { name: 'Task' }).fill('Prep the go/no-go');
      await panel.getByRole('textbox', { name: 'Decision this supports' }).fill('Ship v3.2 or hold');
      await panel.getByRole('textbox', { name: 'Consequence of error' }).fill('A rollout that has to be reversed');
      await panel.getByRole('button', { name: 'Save intent' }).click();
      await expect(page.getByRole('region', { name: 'Session intent' })).toContainText('Ship v3.2 or hold');
      await expectNoAxeViolations(page);

      await panel.getByRole('switch', { name: 'Calibrated' }).uncheck();
      await expect(page.getByRole('status').filter({ hasText: 'Calibrated mode off.' })).toBeAttached();
      await page.reload();
      await expect(
        page.getByRole('complementary', { name: 'Session panel' }).getByRole('switch', { name: 'Calibrated' }),
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Session panel' }).click();
      await expect(
        page.getByRole('complementary', { name: 'Session panel' }).getByRole('switch', { name: 'Calibrated' }),
      ).not.toBeChecked();
    });

    test('export downloads a provenance record', async ({ page }) => {
      await signIn(page, 'mara', '/chats/supplier');
      const panel = page.getByRole('complementary', { name: 'Session panel' });
      await panel.getByRole('tab', { name: 'Metadata' }).click();
      const download = page.waitForEvent('download');
      await panel.getByRole('button', { name: 'Export with provenance' }).click();
      expect((await download).suggestedFilename()).toBe('donovan-supplier-provenance.json');
    });
  });
});
