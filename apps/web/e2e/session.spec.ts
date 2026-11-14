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
      await first.getByRole('button', { name: 'Confirm' }).click();
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
