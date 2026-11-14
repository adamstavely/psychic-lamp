import { Health } from '@donovan/contracts';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports ok in the shared Health shape', () => {
    const health = new HealthController().get();
    expect(Health.parse(health).status).toBe('ok');
  });
});
