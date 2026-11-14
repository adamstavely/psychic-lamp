import { Env } from './env.js';

const local = {
  DATABASE_URL: 'postgres://donovan:donovan@localhost:5433/donovan',
  ELASTICSEARCH_URL: 'http://localhost:9201',
  OIDC_ISSUER: 'http://localhost:8180/realms/donovan',
};

const production = {
  DONOVAN_ENV: 'production',
  DATABASE_URL: 'postgres://donovan_app:s3cret@db.internal:5432/donovan',
  ELASTICSEARCH_URL: 'https://search.internal:9200',
  ELASTICSEARCH_API_KEY: 'encoded-key',
  OIDC_ISSUER: 'https://sso.example.com/realms/pilot',
  MIGRATE_ON_START: 'false',
};

describe('Env', () => {
  it('accepts local defaults outside production', () => {
    expect(Env.parse({ ...local, ALLOW_TEST_RESET: 'true' })).toMatchObject({ ALLOW_TEST_RESET: true });
  });

  it('accepts a hardened production environment', () => {
    expect(Env.parse(production)).toMatchObject({ DONOVAN_ENV: 'production', ALLOW_TEST_RESET: false });
  });

  it('refuses the test reset and developer defaults in production', () => {
    const result = Env.safeParse({ ...local, DONOVAN_ENV: 'production', ALLOW_TEST_RESET: 'true' });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.path[0]).sort()).toEqual(
      [
        'ALLOW_TEST_RESET',
        'DATABASE_URL',
        'ELASTICSEARCH_API_KEY',
        'ELASTICSEARCH_URL',
        'MIGRATE_ON_START',
        'OIDC_ISSUER',
      ].sort(),
    );
  });
});
