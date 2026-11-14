import request from 'supertest';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('OpenAPI', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.app.close());

  it('serves the spec without sign-in, with every route and the shared schemas', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/openapi.json').expect(200);
    const doc = res.body as {
      openapi: string;
      paths: Record<
        string,
        Record<
          string,
          { responses: Record<string, { content?: Record<string, { schema: unknown }> }>; requestBody?: unknown }
        >
      >;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(doc.openapi).toMatch(/^3\./);
    for (const path of [
      '/api/brief',
      '/api/chats',
      '/api/chats/{id}',
      '/api/artifacts',
      '/api/projects/{id}',
      '/api/search',
      '/api/notifications',
    ])
      expect(Object.keys(doc.paths)).toContain(path);
    const chat = doc.paths['/api/chats/{id}']!['get']!.responses['200']!.content!['application/json']!.schema as {
      properties?: object;
      $ref?: string;
    };
    expect(chat.properties ?? chat.$ref).toBeTruthy();
    expect(doc.paths['/api/chats']!['post']!.requestBody).toBeTruthy();
    expect(doc.components.securitySchemes['bearer']).toBeTruthy();
  });

  it('serves Swagger UI', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/docs/').expect(200);
    expect(res.text).toContain('swagger');
  });
});
