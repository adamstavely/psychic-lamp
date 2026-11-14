import { z } from 'zod';
import { PREFERENCE_DEFAULTS as D } from './defaults.js';

/** Per-person settings. Every field has a default, so a stored partial always reads back whole. */
export const Preferences = z.object({
  theme: z.enum(['system', 'light', 'dark']).default(D.theme),
  railExpanded: z.boolean().default(D.railExpanded),
  startMode: z.enum(['assist', 'build']).default(D.startMode),
  showGovernance: z.boolean().default(D.showGovernance),
  briefAutoOpen: z.boolean().default(D.briefAutoOpen),
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

export const DEFAULT_PREFERENCES: Preferences = { ...D };
