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
