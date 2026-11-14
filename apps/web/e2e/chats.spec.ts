import { expectNoAxeViolations } from './a11y';
import { expect, matchTheme, signIn, test } from './fixtures';

test.describe('Chats', () => {
  test('a link to a chat survives signing in', async ({ page }) => {
    await signIn(page, 'alex', '/chats/fraud');
    await expect(page).toHaveURL(/\/chats\/fraud$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Q4 fraud model rollout' })).toBeVisible();
  });

  test('a thread shows each turn, what it was routed to and its blocks', async ({ page }) => {
    await signIn(page, 'alex', '/chats/fraud');
    await matchTheme(page);
    await expect(page).toHaveTitle('Q4 fraud model rollout · Donovan');
    const turns = page.getByRole('list', { name: 'Conversation' });
    await expect(turns.getByRole('heading', { name: 'You' })).toHaveCount(1);
    await expect(turns.getByText('Worked for')).toBeVisible();
    await expect(turns.getByRole('list', { name: 'Routed to' }).first()).toContainText('claude-sonnet-4.5');
    await expect(turns.getByRole('heading', { name: 'Approve post_message?' })).toBeVisible();
    await expect(turns.getByRole('link', { name: /Open Rollout note — Fraud Sentinel v3.2/ })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('a Calibrated chat states its intent and labels its claims', async ({ page }) => {
    await signIn(page, 'alex', '/chats/supplier');
    await matchTheme(page);
    const intent = page.getByRole('region', { name: 'Session intent' });
    await expect(intent).toContainText('$18M commitment');
    await expect(page.locator('tc-claim-answer')).toHaveCount(2);
    await expectNoAxeViolations(page);
  });

  test('the rail lists chats by when they were active and opens one', async ({ page }) => {
    await signIn(page, 'alex');
    const list = page.locator('tc-chat-history');
    await expect(list.getByText('Pinned')).toBeVisible();
    await list.getByText('Draft RFC: tool approval tiers').click();
    await expect(page).toHaveURL(/\/chats\/rfc$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Draft RFC: tool approval tiers' })).toBeVisible();
  });

  test("an unknown chat says it isn't here", async ({ page }) => {
    await signIn(page, 'alex', '/chats/nothing-here');
    await expect(page.getByRole('heading', { name: "That chat isn't here" })).toBeVisible();
  });
});
