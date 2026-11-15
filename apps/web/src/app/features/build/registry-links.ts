import type { RegistryKind, RegistryRef, RegistrySummary, Sensitivity } from '@donovan/contracts';
import { BUILD_AREAS } from '../../shell/areas';

/**
 * The page of a registry item another item names ("GitHub", or "Fraud Sentinel v3.2" for Fraud Sentinel at v3.2.0),
 * or null when the registry doesn't have it.
 */
export function linkTo(all: readonly RegistrySummary[], kind: RegistryKind, name: string): string[] | null {
  const bare = name.replace(/\s+v\d[\w.]*$/, '');
  const found = all.find((i) => i.kind === kind && (i.name === name || i.name === bare));
  const area = BUILD_AREAS.find((a) => a.kind === kind);
  return found && area ? [area.path, found.id] : null;
}

/** An item another links to by id, as the viewer sees it. */
export interface Linked {
  id: string;
  /** Its name now, or as it was when linked if the viewer can't see it. */
  name: string;
  /** Its page, or null when it's gone or out of the viewer's sight. */
  link: string[] | null;
  sensitivity: Sensitivity | null;
}

/** The item a link points at: found by kind and id, so a rename or another item's name can't break it. */
export function linked(all: readonly RegistrySummary[], kind: RegistryKind, ref: RegistryRef): Linked {
  const found = all.find((i) => i.kind === kind && i.id === ref.id);
  const area = BUILD_AREAS.find((a) => a.kind === kind);
  return {
    id: ref.id,
    name: found?.name ?? ref.name,
    link: found && area ? [area.path, found.id] : null,
    sensitivity: found?.sensitivity ?? null,
  };
}
