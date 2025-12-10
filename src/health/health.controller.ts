import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Service Health Check' })
  @ApiOkResponse({
    description: 'Returns service health status',
    schema: {
      example: {
        status: 'ok',
        time: new Date().toISOString(),
      },
    },
  })
  getHealth() {
    return this.healthService.getHealth();
  }
}
