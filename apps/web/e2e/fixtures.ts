import { expect, test as base, type Page } from '@playwright/test';

/** Test users from infra/keycloak/donovan-realm.json. */
export const USERS = {
  alex: { username: 'alex', password: 'alex', name: 'Alex Morgan' },
  mara: { username: 'mara', password: 'mara', name: 'Mara Lindqvist' },
} as const;

/** Signs in through the local Keycloak, the way a person does, and waits for the app. */
export async function signIn(page: Page, user: keyof typeof USERS = 'alex', path = '/'): Promise<void> {
  const { username, password } = USERS[user];
  await page.goto(path);
  await page.getByLabel('Username or email').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('main')).toBeVisible();
}

/**
 * Sets the signed-in person's theme to "system", so the test project's colorScheme decides light or dark. Through the
 * API rather than the header toggle: parallel tests share a test user, and setting a value is safe to repeat.
 */
export async function matchTheme(page: Page): Promise<void> {
  const token = await page.evaluate(() => {
    const stored = JSON.parse(sessionStorage.getItem('0-donovan-web') ?? '{}') as { authzData?: string };
    return stored.authzData ?? '';
  });
  const res = await page.request.patch('/api/me/preferences', {
    headers: { Authorization: `Bearer ${token}` },
    data: { theme: 'system' },
  });
  expect(res.ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-tc-theme', 'system');
}

export const test = base;
export { expect };
