import { z } from 'zod';

/** Per-person settings. Every field has a default, so a stored partial always reads back whole. */
export const Preferences = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  railExpanded: z.boolean().default(true),
  startMode: z.enum(['assist', 'build']).default('assist'),
  showGovernance: z.boolean().default(true),
  briefAutoOpen: z.boolean().default(true),
});
export type Preferences = z.infer<typeof Preferences>;

export const PreferencesPatch = z.strictObject({
  theme: Preferences.shape.theme.removeDefault().optional(),
  railExpanded: z.boolean().optional(),
  startMode: Preferences.shape.startMode.removeDefault().optional(),
  showGovernance: z.boolean().optional(),
  briefAutoOpen: z.boolean().optional(),
});
export type PreferencesPatch = z.infer<typeof PreferencesPatch>;

export const DEFAULT_PREFERENCES: Preferences = Preferences.parse({});
