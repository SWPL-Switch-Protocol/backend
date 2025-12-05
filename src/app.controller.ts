import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('root')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'hello' })
  @ApiOkResponse({
    description: 'hello',
    schema: {
      example: {
        res: 'Hello World!',
      },
    },
  })
  getHello(): any {
    return this.appService.getHello();
  }
}
