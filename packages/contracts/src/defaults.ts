// Plain values with no Zod, so the web app can import them without pulling the validator into its bundle.
// The schemas use these too, so there is one source for each default.

export const PREFERENCE_DEFAULTS = {
  theme: 'system',
  railExpanded: true,
  startMode: 'assist',
  showGovernance: true,
  briefAutoOpen: true,
} as const;

/** The largest file the Artifacts upload accepts. */
export const UPLOAD_LIMIT_BYTES = 512 * 1024;
