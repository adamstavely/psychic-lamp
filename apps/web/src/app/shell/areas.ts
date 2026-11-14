import type { IconName } from '../core/icons';

export interface Area {
  id: string;
  label: string;
  path: string;
  icon: IconName;
}

/** Assist mode's places, in the prototype's order. */
export const ASSIST_AREAS: readonly Area[] = [
  { id: 'brief', label: 'Daily Brief', path: '/brief', icon: 'sun' },
  { id: 'chats', label: 'Chats', path: '/chats', icon: 'chat' },
  { id: 'projects', label: 'Projects', path: '/projects', icon: 'folder' },
  { id: 'artifacts', label: 'Artifacts', path: '/artifacts', icon: 'artifact' },
];

/** Which area a URL belongs to: the first path segment, when it names one. */
export function areaFor(url: string): string | null {
  const first = url.split(/[?#]/)[0]!.split('/').filter(Boolean)[0] ?? '';
  return ASSIST_AREAS.some((a) => a.id === first) ? first : null;
}
