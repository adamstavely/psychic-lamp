import { readFileSync } from 'node:fs';
import { REQUEST_BODY_LIMIT_BYTES } from '@donovan/contracts/defaults';

const repo = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), 'utf8');

describe('the request body limit', () => {
  const mb = REQUEST_BODY_LIMIT_BYTES / (1024 * 1024);

  it('is the same at the web front, the ingress and the API', () => {
    expect(Number.isInteger(mb)).toBe(true);
    expect(read('deploy/web/nginx.conf.template')).toMatch(new RegExp(`client_max_body_size ${mb}m;`));
    expect(read('deploy/pilot/k8s/ingress.yaml')).toMatch(new RegExp(`proxy-body-size: ${mb}m`));
  });
});
