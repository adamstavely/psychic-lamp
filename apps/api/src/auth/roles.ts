import type { Claims } from './claims.js';

/** The identity provider's realm roles in an access token (Keycloak puts them under realm_access). */
export function rolesOf(claims: Claims): string[] {
  const realm = (claims as { realm_access?: { roles?: unknown } }).realm_access;
  return Array.isArray(realm?.roles) ? realm.roles.filter((r): r is string => typeof r === 'string') : [];
}
