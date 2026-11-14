import { expect, test as base, type Page } from '@playwright/test';

/** Test users from infra/keycloak/donovan-realm.json. */
export const USERS = {
  alex: { username: 'alex', password: 'alex', name: 'Alex Morgan' },
  mara: { username: 'mara', password: 'mara', name: 'Mara Lindqvist' },
  // State-changing specs each get their own user, so parallel files never reset each other's data.
  devon: { username: 'devon', password: 'devon', name: 'Devon Price' },
  priya: { username: 'priya', password: 'priya', name: 'Priya Shah' },
  sam: { username: 'sam', password: 'sam', name: 'Sam Adeyemi' },
  kemi: { username: 'kemi', password: 'kemi', name: 'Kemi Okafor' },
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
  const res = await api(page).patch('/api/me/preferences', { theme: 'system' });
  expect(res.ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-tc-theme', 'system');
}

/** Calls the API as the signed-in person, for setting up and undoing test state. */
export function api(page: Page) {
  const token = () =>
    page.evaluate(() => {
      const stored = JSON.parse(sessionStorage.getItem('0-donovan-web') ?? '{}') as { authzData?: string };
      return stored.authzData ?? '';
    });
  const headers = async () => ({ Authorization: `Bearer ${await token()}` });
  return {
    get: async (url: string) => page.request.get(url, { headers: await headers() }),
    patch: async (url: string, data: unknown) => page.request.patch(url, { headers: await headers(), data }),
    put: async (url: string, data: unknown) => page.request.put(url, { headers: await headers(), data }),
    post: async (url: string, data: unknown) => page.request.post(url, { headers: await headers(), data }),
    delete: async (url: string) => page.request.delete(url, { headers: await headers() }),
  };
}

/** Wipes the signed-in test user's data (the API's ALLOW_TEST_RESET endpoint), then reloads on fresh canned content. */
export async function resetUser(page: Page): Promise<void> {
  const res = await api(page).delete('/api/test/me');
  expect(res.status(), 'the API needs ALLOW_TEST_RESET=true (apps/api/.env.example)').toBe(204);
  await page.reload();
  await expect(page.getByRole('main')).toBeVisible();
}

export const test = base;
export { expect };
