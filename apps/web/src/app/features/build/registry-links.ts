import type { RegistryKind, RegistrySummary } from '@donovan/contracts';
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
