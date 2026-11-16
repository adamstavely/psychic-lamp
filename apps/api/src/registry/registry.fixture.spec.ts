import { RegistryItem, RegistryKind } from '@donovan/contracts';
import { REGISTRY_SEED } from './registry.fixture.js';

describe('the starting registry', () => {
  const at = '2026-11-14T10:00:00.000Z';

  it('fits the contract, item by item', () => {
    for (const item of REGISTRY_SEED) {
      const parsed = RegistryItem.safeParse({
        ...item,
        access: null,
        revision: 1,
        liveVersion: null,
        editInReview: null,
        updatedAt: at,
      });
      expect(parsed.success, `${item.kind}:${item.id} ${JSON.stringify(parsed.error?.issues[0])}`).toBe(true);
    }
  });

  it('has every kind, with ids and slugs unique within each', () => {
    expect(new Set(REGISTRY_SEED.map((i) => i.kind))).toEqual(new Set(RegistryKind.options));
    const ids = REGISTRY_SEED.map((i) => `${i.kind}:${i.id}`);
    const slugs = REGISTRY_SEED.map((i) => `${i.kind}:${i.slug}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('links only to items it has, by id and with their names', () => {
    const find = (kind: RegistryKind, id: string) => REGISTRY_SEED.find((i) => i.kind === kind && i.id === id);
    const links: { from: string; kind: RegistryKind; id: string; name: string }[] = [];
    for (const item of REGISTRY_SEED) {
      const from = `${item.kind}:${item.id}`;
      const d = item.details as Record<string, unknown>;
      if (item.kind === 'agent') {
        for (const r of d['servers'] as { id: string; name: string }[]) links.push({ from, kind: 'server', ...r });
        for (const r of d['skills'] as { id: string; name: string }[]) links.push({ from, kind: 'skill', ...r });
      }
      if (item.kind === 'dataset')
        for (const r of d['usedBy'] as { id: string; name: string }[]) links.push({ from, kind: 'model', ...r });
      if (item.kind === 'collection')
        for (const m of d['members'] as { kind: RegistryKind; id: string; name: string }[]) links.push({ from, ...m });
    }
    expect(links.length).toBeGreaterThan(20);
    for (const l of links) expect(find(l.kind, l.id)?.name, `${l.from} → ${l.kind}:${l.id}`).toBe(l.name);
  });

  it("gives a collection its most sensitive member's tier", () => {
    const risk = REGISTRY_SEED.find((i) => i.kind === 'collection' && i.name === 'Risk & fraud')!;
    expect(risk.sensitivity).toBe('Restricted');
  });
});
