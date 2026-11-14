import { Controller, Get } from '@nestjs/common';
import type { Health } from '@donovan/contracts';

@Controller('health')
export class HealthController {
  @Get()
  get(): Health {
    return { status: 'ok', version: process.env.npm_package_version ?? '0.0.0' };
  }
}
