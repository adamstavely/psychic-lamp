import { type INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Env } from './config/env.js';
import { requestId } from './observability/request-id.js';
import { securityHeaders } from './observability/security-headers.js';
import { SafeErrorFilter } from './observability/safe-errors.filter.js';

/** What every Donovan app instance gets, in main.ts and in integration tests alike. */
export function setUp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  const production =
    app.get<ConfigService<Env, true>>(ConfigService).get('DONOVAN_ENV', { infer: true }) === 'production';
  app.use(requestId);
  app.use(securityHeaders(production));
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new SafeErrorFilter());
  app.enableShutdownHooks();

  // OpenAPI from the controllers and the shared Zod contracts: Swagger UI at /api/docs, the spec at /api/openapi.json.
  const config = new DocumentBuilder()
    .setTitle('Donovan API')
    .setDescription('Assist: the Daily Brief, chats, artifacts, projects, search and notifications.')
    .setVersion(process.env['npm_package_version'] ?? '0.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'An access token from the OIDC provider',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json', useGlobalPrefix: false });
  return app;
}
