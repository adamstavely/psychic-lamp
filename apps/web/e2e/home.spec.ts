import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './a11y';

test('home has a title, a main landmark and no axe violations', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Donovan');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Donovan');
  await expectNoAxeViolations(page);
});
