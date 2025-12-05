import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'health check' })
  @ApiOkResponse({
    description: 'health check',
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
