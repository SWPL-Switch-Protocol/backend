import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  Get,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { GreenfieldService } from './greenfield.service';
import { CreateBucketDto } from './dto/create-bucket.dto';
import { GrantPermissionDto } from './dto/grant-permission.dto';

@ApiTags('greenfield')
@Controller('greenfield')
export class GreenfieldController {
  constructor(private readonly greenfieldService: GreenfieldService) {}

  @Post('bucket')
  @ApiOperation({ summary: 'Greenfield 버킷 생성' })
  async createBucket(@Body() createBucketDto: CreateBucketDto) {
    return this.greenfieldService.createBucket(createBucketDto.bucketName);
  }

  @Post('object')
  @ApiOperation({ summary: '파일 업로드' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        bucketName: { type: 'string', example: 'test-bucket-2' },
        objectName: { type: 'string', example: 'images/test.png' },
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Body('bucketName') bucketName: string,
    @Body('objectName') objectName: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    console.log(`uploadFile to ${bucketName}, objectName: ${objectName}, fileName: ${file.originalname}, size: ${file.size}, mimetype: ${file.mimetype}`);
    return this.greenfieldService.uploadFile(
      bucketName,
      objectName,
      file.buffer,
      file.mimetype,
    );
  }

  @Get('object')
  @ApiOperation({ summary: '파일 다운로드 URL 조회' })
  async getDownloadUrl(
    @Query('bucketName') bucketName: string,
    @Query('objectName') objectName: string,
  ) {
    const url = await this.greenfieldService.getDownloadUrl(
      bucketName,
      objectName,
    );
    return { url };
  }

  @Post('permission')
  @ApiOperation({ summary: '버킷/오브젝트 권한 부여' })
  async grantPermission(@Body() dto: GrantPermissionDto) {
    return this.greenfieldService.grantPermission(
      dto.bucketName,
      dto.objectName,
      dto.grantee,
      dto.actionType,
    );
  }
}
