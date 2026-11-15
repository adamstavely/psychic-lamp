import { RegistryItem, RegistryKind } from '@donovan/contracts';
import { REGISTRY_SEED } from './registry.fixture.js';

describe('the starting registry', () => {
  const at = '2026-11-14T10:00:00.000Z';

  it('fits the contract, item by item', () => {
    for (const item of REGISTRY_SEED) {
      const parsed = RegistryItem.safeParse({ ...item, access: null, updatedAt: at });
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

  it("gives a collection its most sensitive member's tier", () => {
    const risk = REGISTRY_SEED.find((i) => i.kind === 'collection' && i.name === 'Risk & fraud')!;
    expect(risk.sensitivity).toBe('Restricted');
  });
});
