import type { Claims } from '../auth/claims.js';

export interface Identity {
  subject: string;
  name: string;
  firstName: string;
  email: string | null;
}

/** What Donovan keeps of a person from their token: a display name, a first name for greetings, and email. */
export function identityFrom(claims: Claims): Identity {
  const joined = [claims.given_name, claims.family_name].filter(Boolean).join(' ');
  const name = claims.name?.trim() || joined || claims.preferred_username || claims.email || 'Unknown user';
  const firstName = claims.given_name?.trim() || name.split(/\s+/)[0] || name;
  return { subject: claims.sub, name, firstName, email: claims.email ?? null };
}

/** Up to two letters for an avatar: first and last word of the name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((w) => w!.charAt(0).toUpperCase()).join('');
}
