import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Insights } from '@donovan/contracts';
import { Controller, Get } from '@nestjs/common';
import { InsightsService } from './insights.service.js';

@ApiTags('Insights')
@ApiBearerAuth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  @ApiOkResponse({ standardSchema: Insights })
  async get(): Promise<Insights> {
    return this.insights.insights();
  }
}
