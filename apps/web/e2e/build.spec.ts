import { expectNoAxeViolations } from './a11y';
import { api, expect, matchTheme, resetUser, signIn, test } from './fixtures';

test.describe('the Build catalog', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'alex', '/build/servers');
    await matchTheme(page);
  });

  test('shows an area as cards, each with its state, figures and actions', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Connect tools and data.', level: 1 })).toBeVisible();
    const cards = page.getByRole('list').filter({ has: page.getByRole('heading', { name: 'Filesystem' }) });
    const fs = cards.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Filesystem' }) });
    await expect(fs).toContainText('Verified');
    await expect(fs).toContainText('3 tools');
    await expect(fs.getByRole('button', { name: 'Use in chat' })).toBeVisible();
    await expectNoAxeViolations(page);

    await fs.getByRole('link', { name: 'Open Filesystem' }).click();
    await expect(page).toHaveURL(/\/build\/servers\/filesystem$/);
  });

  test('opens on Team, as the prototype does, and All is in the address', async ({ page }) => {
    await expect(page.getByRole('radio', { name: 'Team' })).toBeChecked();
    await expect(page.getByText('MCP Servers · Team')).toBeVisible();
    await page.getByRole('radio', { name: 'All' }).click();
    await expect(page).toHaveURL(/scope=all/);
    await page.getByRole('radio', { name: 'Team' }).click();
    await expect(page).toHaveURL(/\/build\/servers$/);
  });

  test("a space's Try it opens it with its sample filled in; Open opens it empty", async ({ page }) => {
    await page.goto('/build/spaces');
    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Fraud score explainer' }) });
    await card.getByRole('button', { name: 'Try it' }).click();
    await expect(page).toHaveURL(/\/build\/spaces\/fraud-explainer\?try=sample$/);
    const input = page.getByRole('textbox', { name: 'Transaction JSON' });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(/"merchant_id": "m_88213"/);
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByRole('region', { name: /^Result/ })).toContainText('0.971');

    await page.goto('/build/spaces');
    await card.getByRole('link', { name: 'Open Fraud score explainer' }).click();
    await expect(page).toHaveURL(/\/build\/spaces\/fraud-explainer$/);
    await expect(page.getByRole('textbox', { name: 'Transaction JSON' })).toHaveValue('');
  });

  test('switches to a list, and between Mine, Team and All', async ({ page }) => {
    await page.getByRole('radio', { name: 'List view' }).click();
    await expect(page).toHaveURL(/view=list/);
    const table = page.getByRole('table', { name: 'MCP Servers' });
    await expect(table.getByRole('row')).toHaveCount(7); // a header and six servers
    await expect(table.getByRole('rowheader', { name: /^Salesforce/ })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('radio', { name: 'Mine' }).click();
    await expect(page).toHaveURL(/scope=mine/);
    await expect(page.getByText("You haven't registered any MCP servers yet.")).toBeVisible();
    await expect(page.getByRole('link', { name: 'See all MCP servers' })).toBeVisible();
    await expectNoAxeViolations(page);

    // The address keeps the view: reloading shows the same.
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Mine' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'List view' })).toBeChecked();

    // An empty Mine leads on to registering one of that kind.
    await page.getByRole('link', { name: 'Register one' }).click();
    await expect(page).toHaveURL(/\/build\/register\?kind=server&from=servers$/);
  });

  test('filters models by task, and uses one in a new chat', async ({ page }) => {
    await page.goto('/build/models');
    const cards = page.getByRole('main').getByRole('listitem');
    await expect(cards).toHaveCount(9);
    await page.getByRole('button', { name: /^Foundation/ }).click();
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole('button', { name: /^Foundation/ })).toHaveAttribute('aria-pressed', 'true');

    await cards
      .filter({ has: page.getByRole('heading', { name: 'claude-opus-4.1' }) })
      .getByRole('button', { name: 'Use in chat' })
      .click();
    await expect(page).toHaveURL(/\/chats\/new\?/);
    await expect(page.getByRole('textbox')).toHaveValue(/^Using claude-opus-4\.1/);
  });
});

test.describe('server and agent pages', () => {
  test('a server lists its tools, and a tool can be tried in the sandbox', async ({ page }) => {
    await signIn(page, 'alex', '/build/servers/filesystem');
    await matchTheme(page);
    await expect(page.getByRole('heading', { name: 'Filesystem', level: 1 })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Parameters of write_file' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Try read_file' }).click();
    const dialog = page.getByRole('dialog', { name: 'Try read_file' });
    await dialog.getByRole('button', { name: 'Run tool' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Fill in path');
    await dialog.getByRole('textbox', { name: /path/ }).fill('fraud/q4-plan.md');
    await dialog.getByRole('button', { name: 'Run tool' }).click();
    await expect(dialog.getByRole('status')).toContainText('200 OK');
    await expect(dialog).toContainText('"path": "fraud/q4-plan.md"');
    await expectNoAxeViolations(page);
  });

  test('a server shows how it is reached and how to add it on one page, with no tabs', async ({ page }) => {
    await signIn(page, 'alex', '/build/servers/filesystem');
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Tools · 3' })).toContainText(
      'Calls run through the Donovan gateway',
    );
    const install = page
      .getByRole('complementary', { name: 'About this server' })
      .getByRole('region', { name: 'Install' });
    await expect(install).toContainText('donovan servers add anthropic/filesystem@v0.9.4');
    await expect(install).toContainText('Not installed in any of your clients yet.');
  });

  test('an agent links what it is built from, and Run in chat starts a chat with its model', async ({ page }) => {
    await signIn(page, 'alex', '/build/agents/release');
    await matchTheme(page);
    await expect(page.getByRole('heading', { name: 'Release captain', level: 1 })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('link', { name: 'GitHub' }).click();
    await expect(page).toHaveURL(/\/build\/servers\/github$/);
    await page.goBack();
    await page.getByRole('button', { name: 'Run in chat' }).click();
    await expect(page).toHaveURL(/\/chats\/new\?q=Run%20the%20Release%20captain%20agent/);
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('Run the Release captain agent: ');
    await expect(page.locator('tc-chat-composer').getByRole('button', { name: /Claude Sonnet 4\.5/ })).toBeVisible();
  });

  test.describe('changing state', () => {
    test.skip(({ colorScheme }) => colorScheme !== 'light', 'state-changing; runs once');

    test('installing a server in a client is kept, and can be taken out', async ({ page }) => {
      await signIn(page, 'devon', '/build/servers/filesystem');
      await page
        .getByRole('complementary', { name: 'About this server' })
        .getByRole('button', { name: 'Install in a client' })
        .click();
      const dialog = page.getByRole('dialog', { name: 'Install Filesystem' });
      await dialog.getByRole('radio', { name: 'Cursor' }).check();
      await expect(dialog).toContainText('"filesystem"');
      await expectNoAxeViolations(page);
      await dialog.getByRole('button', { name: 'Install' }).click();
      await expect(dialog).toBeHidden();

      await page.reload();
      const remove = page.getByRole('button', { name: 'Remove from Cursor' });
      await expect(remove).toBeVisible();
      await remove.click();
      await expect(remove).toBeHidden();
    });
  });
});

test.describe('model, dataset, space and collection pages', () => {
  test("a model's figures, evals, code and files on one page, with no tabs", async ({ page }) => {
    await signIn(page, 'alex', '/build/models/sonnet');
    await matchTheme(page);
    await expect(page.getByRole('heading', { name: 'claude-sonnet-4.5', level: 1 })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('main')).toContainText('SWE-bench');
    await expect(page.getByRole('table', { name: 'Evals of claude-sonnet-4.5' })).toContainText('SWE-bench Verified');
    await expect(page.getByRole('region', { name: 'Call it from code' })).toContainText('anthropic/claude-sonnet-4-5');
    await expect(
      page.getByRole('complementary', { name: 'About this model' }).getByRole('region', { name: /^Files · / }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("a dataset's schema, how to load it, and the models that use it", async ({ page }) => {
    await signIn(page, 'alex', '/build/datasets/txn-graph');
    await matchTheme(page);
    await expect(page.getByRole('table', { name: 'Schema of Transaction graph 2026-Q3' })).toContainText('label_fraud');
    await expectNoAxeViolations(page);
    await page
      .getByRole('complementary', { name: 'About this dataset' })
      .getByRole('link', { name: 'Fraud Sentinel' })
      .click();
    await expect(page).toHaveURL(/\/build\/models\/[a-z0-9-]+$/);
    await expect(page.getByRole('heading', { name: 'Fraud Sentinel', level: 1 })).toBeVisible();
  });

  test("a collection links each member to its page, with the member's tier", async ({ page }) => {
    await signIn(page, 'alex', '/build/collections/risk-fraud');
    await matchTheme(page);
    const members = page.getByRole('list').filter({ hasText: 'Churn Propensity' });
    await expect(members.getByRole('link')).toHaveCount(6);
    await expect(members.getByRole('listitem').filter({ hasText: 'Churn Propensity' })).toContainText('Internal');
    await expectNoAxeViolations(page);
    await members.getByRole('link', { name: 'Churn Propensity' }).click();
    await expect(page).toHaveURL(/\/build\/models\/churn$/);
    await expect(page.getByRole('heading', { name: 'Churn Propensity', level: 1 })).toBeVisible();
  });

  test('a space asks for input, runs, and links its model', async ({ page }) => {
    await signIn(page, 'alex', '/build/spaces/fraud-explainer');
    await matchTheme(page);
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Give it' })).toHaveText(
      'Give it transaction json to run on.',
    );
    await page.getByRole('textbox', { name: 'Transaction JSON' }).fill('{"amount": 1249.00}');
    await page.getByRole('button', { name: 'Run' }).click();
    const result = page.getByRole('region', { name: /^Result/ });
    await expect(result).toContainText('0.971');
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Open the model' }).click();
    await expect(page.getByRole('heading', { name: 'Fraud Sentinel', level: 1 })).toBeVisible();
  });

  test('a space can be used in a chat', async ({ page }) => {
    await signIn(page, 'alex', '/build/spaces/fraud-explainer');
    await page.getByRole('button', { name: 'Use in chat' }).click();
    await expect(page).toHaveURL(/\/chats\/new\?q=Using/);
    await expect(page.getByRole('textbox')).toHaveValue(/^Using Fraud score explainer \(/);
  });

  test.describe('changing state', () => {
    test.skip(({ colorScheme }) => colorScheme !== 'light', 'state-changing; runs once');

    test("attaching a collection raises a project to the collection's tier", async ({ page }) => {
      await signIn(page, 'devon', '/build/collections/risk-fraud');
      await resetUser(page);
      const made = await api(page).post('/api/projects', {
        name: `Collection test ${Date.now()}`,
        sensitivity: 'Internal',
      });
      const project = (await made.json()) as { id: string; name: string };
      await page.reload();
      await expect(page.getByRole('link', { name: 'Fraud Sentinel' })).toBeVisible();
      await expectNoAxeViolations(page);

      await page.getByRole('button', { name: 'Attach to a project' }).click();
      const dialog = page.getByRole('dialog', { name: 'Attach Risk & fraud' });
      // The newest project comes first, picked.
      await expect(dialog.getByRole('button', { name: /^Project/ })).toHaveText(`${project.name} · Internal`);
      await dialog.getByRole('button', { name: 'Attach' }).click();
      await expect(page.getByText(`${project.name} is now Restricted, up from Internal`).first()).toBeVisible();
      const aside = page.getByRole('complementary', { name: 'About this collection' });
      await expect(aside.getByRole('link', { name: project.name })).toBeVisible();

      await aside.getByRole('button', { name: `Take off ${project.name}` }).click();
      await expect(aside.getByRole('link', { name: project.name })).toHaveCount(0);
    });
  });
});

test.describe('skill, prompt and workflow pages', () => {
  test("a skill's tests and its SKILL.md on one page, with no tabs", async ({ page }) => {
    await signIn(page, 'alex', '/build/skills/rollout');
    await matchTheme(page);
    await expect(page.getByRole('heading', { name: 'Rollout note', level: 1 })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Instructions' })).toContainText('## Lead with the decision');
    const tests = page.getByRole('table', { name: 'Tests of Rollout note' });
    await expect(tests.getByRole('row', { name: /Empty findings/ })).toContainText('Fail');
    await expectNoAxeViolations(page);
  });

  test("a prompt's published version, its tests, and its history", async ({ page }) => {
    await signIn(page, 'alex', '/build/prompts/status');
    await matchTheme(page);
    await expect(page.getByRole('heading', { name: 'Published version · v2' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Tests of Weekly status, exec voice at v2' })).toBeVisible();
    const v1 = page.getByRole('listitem').filter({ hasText: 'First version' });
    await v1.getByText('v1', { exact: true }).click();
    await expect(v1).toContainText('You write weekly status updates.');
    await expectNoAxeViolations(page);
  });

  test('a workflow runs on its canvas, stopping at its approval until someone approves', async ({ page }) => {
    await signIn(page, 'alex', '/build/workflows/weekly');
    await matchTheme(page);
    await expect(page.getByRole('heading', { name: 'Weekly fraud digest', level: 1 })).toBeVisible();
    await expect(page.getByRole('group', { name: 'The flow' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Run now' }).click();
    const log = page.getByRole('complementary', { name: 'Run log' });
    await expect(page.getByText('Waiting for approval', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(log).toContainText('Risk lead sign-off is waiting for approval from Confidential · Risk ML.');
    await expectNoAxeViolations(page);
    await log.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(log.getByRole('listitem')).toHaveCount(5);
    await expect(log.getByRole('listitem').first()).toContainText('Post to #risk-ops');
  });
});

test.describe('registering', () => {
  test.skip(({ colorScheme }) => colorScheme !== 'light', 'state-changing; runs once');

  test('a new workflow is built on the canvas, checked, and sent to review', async ({ page }) => {
    // Not devon: the server test resets devon in parallel, which would take this draft with it.
    await signIn(page, 'priya', '/build/workflows');
    await resetUser(page);
    await page.getByRole('button', { name: 'New workflow' }).click();
    await expect(page).toHaveURL(/\/build\/workflows\/[a-z0-9-]+\?mode=edit$/);
    const checks = page.getByRole('region', { name: /^Checks/ });
    await expect(checks).toContainText('Blocking: Add a trigger, so it knows when to run.');
    await expectNoAxeViolations(page);

    const palette = page.getByRole('complementary', { name: 'Add a step' });
    await palette.getByRole('button', { name: /^Add a trigger step/ }).click();
    await palette.getByRole('button', { name: /^Add a tool step/ }).click();
    const settings = page.getByRole('complementary', { name: 'Step settings' });
    await settings.getByRole('button', { name: 'Server tool' }).click();
    await page.getByRole('option', { name: 'Slack · post_message (write)' }).click();
    await expect(checks).toContainText('Blocking: New tool step writes outside Donovan with no approval before it.');
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Save & publish' }).click();
    await expect(page.getByText('1 blocking issue', { exact: true })).toBeVisible();

    // An approval between the trigger and the tool clears it.
    await settings.getByRole('button', { name: 'Delete step' }).click();
    await page.getByRole('button', { name: /New trigger step/ }).click();
    await palette.getByRole('button', { name: /^Add an approval step/ }).click();
    await palette.getByRole('button', { name: /^Add a tool step/ }).click();
    await expect(checks).toContainText('No issues. Ready to publish.');
    await page.getByRole('button', { name: 'Save & publish' }).click();
    await expect(page.getByRole('region', { name: 'Waiting for review' })).toContainText('Round 1: 0 of 2');
    await expect(page.getByText('3 steps', { exact: false }).first()).toBeVisible();
    await resetUser(page);
  });

  test('registering a server takes five steps, and it waits for review in Mine', async ({ page }) => {
    await signIn(page, 'devon', '/build/servers');
    await resetUser(page);
    const rail = page.getByRole('navigation', { name: 'Build' }).getByRole('link', { name: /^MCP Servers/ });
    await expect(rail).toHaveText(/\d+\s*$/);
    const before = Number(/(\d+)\s*$/.exec(await rail.innerText())![1]);
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page).toHaveURL(/\/build\/register\?kind=server&from=servers$/);
    await expect(page.getByRole('radio', { name: /^MCP server/ })).toBeChecked();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Give it a name' })).toBeFocused();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('.step').getByRole('alert')).toHaveText('Name it.');
    const name = `Ticket reader ${Date.now()}`;
    await page.getByRole('textbox', { name: 'Name' }).fill(name);
    await page.getByRole('textbox', { name: /^Summary/ }).fill('Reads support tickets.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('textbox', { name: /^Endpoint/ }).fill('https://mcp.example.com/sse');
    await page.getByRole('radio', { name: 'API key' }).check();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    // The step list can't skip a step that's since lost what it needs.
    const steps = page.getByRole('navigation', { name: 'Steps' });
    await steps.getByRole('button', { name: /Identity/ }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('');
    await steps.getByRole('button', { name: /Governance/ }).click();
    await expect(page.locator('.step').getByRole('alert')).toHaveText('Name it.');
    await expect(page.getByRole('heading', { name: 'Give it a name' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Name' }).fill(name);
    await steps.getByRole('button', { name: /Governance/ }).click();

    await page.getByRole('button', { name: /^Internal ?, this mcp server/i }).click();
    await page.getByRole('option', { name: /^Confidential/ }).click();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Review and submit' })).toBeVisible();
    await expect(page.locator('.review')).toContainText('API key');
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByRole('heading', { name: 'Submitted for review' })).toBeVisible();
    await expect(rail).toHaveText(new RegExp(`${before + 1}\\s*$`));

    await page.getByRole('link', { name: 'See your submissions' }).click();
    await expect(page).toHaveURL(/\/build\/servers\?scope=mine$/);
    const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name }) });
    await expect(card).toContainText('Waiting for review');
    await resetUser(page);
  });
});

test.describe('Insights', () => {
  test("shows the workspace's usage, counted from what's stored", async ({ page }) => {
    await signIn(page, 'alex', '/build/insights');
    await matchTheme(page);
    await expect(page.getByRole('heading', { name: 'Usage, routing and the registry.' })).toBeVisible();
    await expect(page.getByRole('term').filter({ hasText: 'Questions' })).toBeVisible();
    // Each counted figure says how it changed on the 30 days before; the registry's running total doesn't.
    const questions = page.locator('.kpis > div').filter({ hasText: 'Questions' });
    await expect(questions).toContainText(/(Up|Down) .+ the 30 days before|Same as the 30 days before/);
    await expect(page.locator('.kpis > div').filter({ hasText: 'In the registry' })).not.toContainText(
      '30 days before',
    );
    const byModel = page.getByRole('region', { name: 'Answers by model' });
    await expect(byModel.getByRole('listitem').filter({ hasText: 'claude-sonnet-4.5' })).toContainText('%');
    await expectNoAxeViolations(page);
  });
});
