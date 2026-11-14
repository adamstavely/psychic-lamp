import { type INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';

/** What every Donovan app instance gets, in main.ts and in integration tests alike. */
export function setUp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  return app;
}
