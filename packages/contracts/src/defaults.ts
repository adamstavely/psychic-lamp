// Plain values with no Zod, so the web app can import them without pulling the validator into its bundle.
// The schemas use these too, so there is one source for each default.

export const PREFERENCE_DEFAULTS = {
  theme: 'system',
  railExpanded: true,
  startMode: 'assist',
  showGovernance: true,
  briefAutoOpen: true,
} as const;

/** The largest file the Artifacts upload accepts, in bytes of UTF-8 (as the browser counts a file's size). */
export const UPLOAD_LIMIT_BYTES = 512 * 1024;

/**
 * The largest request body the API (and the proxies in front of it: deploy/web/nginx.conf.template and the ingress)
 * accepts. A file's text travels as a JSON string, where each control character becomes six bytes (\u0001), so an
 * upload at the limit can take up to six times its size; this covers that and the request's other fields.
 */
export const REQUEST_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

/** The length of a text in bytes of UTF-8. */
export const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

/** The chat personas (chat.ts Persona), as people see them, and what each does. */
export const PERSONAS = [
  { id: 'balanced', label: 'Balanced', description: 'Even-handed: the default' },
  { id: 'red-cell', label: 'Red Cell', description: 'Argues against the obvious reading' },
  { id: 'historian', label: 'Historian', description: 'Sets the question against what came before' },
  { id: 'collection', label: 'Collection', description: 'Gathers what is known before judging it' },
] as const;

/** What answers may draw on (chat.ts Knowledge), as people see it. */
export const KNOWLEDGE_SOURCES = [
  { id: 'workspace', label: 'Workspace docs', description: "The workspace's tools and documents" },
  { id: 'training', label: 'Training only', description: 'What the model knows; no tools or documents' },
  { id: 'live', label: 'Live', description: 'The workspace, plus a live web search' },
] as const;
