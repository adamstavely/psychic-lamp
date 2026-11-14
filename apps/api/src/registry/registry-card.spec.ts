import { cardFor, type CardInput } from './registry-card.js';
import { REGISTRY_SEED } from './registry.fixture.js';

const seeded = (kind: string, id: string) =>
  REGISTRY_SEED.find((i) => i.kind === kind && i.id === id) as unknown as CardInput;

describe('cardFor', () => {
  it("shows each kind's state and figures", () => {
    expect(cardFor(seeded('server', 'filesystem'))).toMatchObject({
      badge: 'Verified',
      badgeTone: 'ok',
      stats: ['3 tools', '213k installs'],
    });
    expect(cardFor(seeded('server', 'pim'))).toMatchObject({ badge: 'Unverified', badgeTone: 'warn' });
    expect(cardFor(seeded('model', 'opus'))).toMatchObject({ badge: 'Foundation', facet: 'Foundation' });
  });

  it('says where an unpublished item is in review, instead of its usual state', () => {
    expect(cardFor(seeded('skill', 'invoice'))).toMatchObject({ badge: 'Waiting for review', badgeTone: 'warn' });
    expect(cardFor({ ...seeded('server', 'filesystem'), status: 'changes-requested' })).toMatchObject({
      badge: 'Changes requested',
    });
  });
});
