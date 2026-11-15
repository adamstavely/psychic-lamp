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

  test("offers only what works: no Request approval or Connect apps, which Donovan doesn't have", async ({ page }) => {
    await signIn(page, 'alex', '/chats');
    await expect(page.getByRole('button', { name: 'Add attachment' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request approval' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Connect apps' })).toHaveCount(0);
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

    test('a file sent with the first message is read, linked from the turn and listed as a source', async ({
      page,
    }) => {
      await signIn(page, 'priya', '/chats');
      await resetUser(page);
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Add attachment' }).click();
      await (
        await chooser
      ).setFiles({ name: 'launch-notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Launch\n\nFriday.') });
      await expect(page.locator('tc-chat-composer').getByText('launch-notes.md')).toBeVisible();
      await page.getByRole('textbox', { name: 'Message' }).fill('Summarize these notes');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/chats\/[a-z0-9]{8}$/);
      await expect(page.getByText(/^I read launch-notes\.md/)).toBeVisible();
      const attached = page.getByRole('list', { name: 'Attached files' });
      await expect(attached.getByRole('link', { name: 'launch-notes.md' })).toBeVisible();
      await page.getByRole('button', { name: 'Session panel' }).click();
      const panel = page.getByRole('complementary', { name: 'Session panel' });
      await panel.getByRole('tab', { name: 'Sources' }).click();
      await expect(panel.getByRole('link', { name: 'launch-notes.md' })).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('the model picked for a reply stays picked, and Regenerate uses it', async ({ page }) => {
      await signIn(page, 'priya', '/chats/rfc');
      await resetUser(page);
      const composer = page.locator('tc-chat-composer');
      await composer.getByRole('button', { name: 'Auto' }).click();
      await page.getByRole('option', { name: /Claude Opus 4\.1/ }).click();
      await page.getByRole('textbox', { name: 'Message' }).fill('Anything else?');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('status').filter({ hasText: 'Donovan answered.' })).toBeAttached();
      const routed = page.getByRole('list', { name: 'Routed to' }).last();
      await expect(routed).toContainText('claude-opus-4.1');
      await expect(composer.getByRole('button', { name: /Claude Opus 4\.1/ })).toBeVisible();
      await page
        .locator('tc-message-actions')
        .last()
        .getByRole('button', { name: /Regenerate/ })
        .click();
      await expect(page.getByRole('status').filter({ hasText: 'Version 2 of the answer is ready.' })).toBeAttached();
      await expect(page.getByRole('list', { name: 'Routed to' }).last()).toContainText('claude-opus-4.1');
    });

    test('persona and knowledge shape the next answer, and the meter shows the context window', async ({ page }) => {
      await signIn(page, 'priya', '/chats');
      await resetUser(page);
      await page.getByRole('textbox', { name: 'Message' }).fill('Hello');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('status').filter({ hasText: 'Donovan answered.' })).toBeAttached();

      const settings = page.getByRole('group', { name: 'Answer settings' });
      await settings.getByRole('button', { name: /^Persona/ }).click();
      await page.getByRole('option', { name: /^Red Cell/ }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Persona: Red Cell.' })).toBeAttached();
      await settings.getByRole('button', { name: /^Knowledge/ }).click();
      await page.getByRole('option', { name: /^Training only/ }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Knowledge: Training only.' })).toBeAttached();

      await page.getByRole('textbox', { name: 'Message' }).fill('What should I prep for the 2:00 PM go/no-go?');
      await page.keyboard.press('Enter');
      await expect(page.getByText('Red Cell: arguing against the obvious reading.')).toBeVisible();
      await expect(page.getByText(/^Training only: answered from what the model knows/)).toBeVisible();
      await expect(page.locator('tc-tool-call-card')).toHaveCount(0);

      await settings.getByRole('button', { name: /^Context window: [\d.]+k? \/ 200k tokens$/ }).click();
      await expect(page.locator('#context-pop').getByText('System prompt · Red Cell').first()).toBeVisible();
      await expectNoAxeViolations(page);
      await page.reload();
      await expect(
        page.getByRole('group', { name: 'Answer settings' }).getByRole('button', { name: /^Persona/ }),
      ).toContainText('Red Cell');
    });

    test('"Always in this chat" lets a write tool run without asking, until it is revoked', async ({ page }) => {
      await signIn(page, 'priya', '/chats');
      await resetUser(page);
      const ask = async () => {
        await page.getByRole('textbox', { name: 'Message' }).fill('Post the rollout update to the team');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('status').filter({ hasText: 'Donovan answered.' })).toBeAttached();
      };
      await ask();
      const card = page.locator('tc-approval-card');
      await expect(card.getByRole('heading', { name: 'Approve post_message?' })).toBeVisible();
      await expect(card).toContainText('Nothing runs. Donovan asks what to change.');
      await card.getByRole('checkbox', { name: /Always in this chat/ }).check();
      await card.getByRole('button', { name: 'Approve once' }).click();
      const panel = page.getByRole('complementary', { name: 'Session panel' });
      await page.getByRole('button', { name: 'Session panel' }).click();
      await expect(panel.getByRole('button', { name: 'Revoke post_message' })).toBeVisible();
      await ask();
      await expect(page.getByText(/^Ran post_message without asking/)).toBeVisible();
      await expect(page.locator('tc-approval-card')).toHaveCount(0);
      await expectNoAxeViolations(page);

      await panel.getByRole('button', { name: 'Revoke post_message' }).click();
      await expect(panel.getByRole('button', { name: 'Revoke post_message' })).toHaveCount(0);
      await ask();
      await expect(page.locator('tc-approval-card')).toHaveCount(1);
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
      const saved = page.waitForResponse((r) => r.url().includes('/vote') && r.request().method() === 'PUT');
      await actions.getByRole('button', { name: 'Send' }).click();
      await saved;
      await page.reload();
      await expect(
        page.locator('tc-message-actions').first().getByRole('button', { name: 'Bad response' }),
      ).toHaveAttribute('aria-pressed', 'true');
    });

    test('Regenerate adds a version, and the switcher goes back to the first', async ({ page }) => {
      await signIn(page, 'priya', '/chats/rfc');
      await resetUser(page);
      const actions = page.locator('tc-message-actions').last();
      await actions.getByRole('button', { name: /Regenerate/ }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Version 2 of the answer is ready.' })).toBeAttached();
      await expect(
        page.getByText(/^(Here is another take|Looking at it again|A different angle)/).last(),
      ).toBeVisible();
      await page
        .locator('tc-message-actions')
        .last()
        .getByRole('button', { name: /Previous version/i })
        .click();
      await expect(page.getByRole('status').filter({ hasText: 'Showing version 1 of 2.' })).toBeAttached();
      await page.reload();
      await expect(page.getByText(/^(Here is another take|Looking at it again|A different angle)/)).toHaveCount(0);
    });
  });
});
