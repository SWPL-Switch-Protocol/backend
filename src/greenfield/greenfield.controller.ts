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
  @ApiOperation({ summary: 'Create Greenfield Bucket' })
  async createBucket(@Body() createBucketDto: CreateBucketDto) {
    return this.greenfieldService.createBucket(createBucketDto.bucketName);
  }

  @Post('object')
  @ApiOperation({ summary: 'Upload File' })
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

  @Post('object/metadata')
  @ApiOperation({ summary: 'Upload Meta Data' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        bucketName: { type: 'string', example: 'metadata-bucket' },
        objectName: { type: 'string', example: 'SBTTransfer_metadata.json' },
        jsonData: { type: 'object', example: { key: 'value', id: 1 } },
      },
    },
  })
  async uploadJson(
    @Body('bucketName') bucketName: string,
    @Body('objectName') objectName: string,
    @Body('jsonData') jsonData: Record<string, any>,
  ) {
    return this.greenfieldService.uploadJson(bucketName, objectName, jsonData);
  }

  @Get('object')
  @ApiOperation({ summary: 'Get File Download URL' })
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
  @ApiOperation({ summary: 'Grant Bucket/Object Permissions' })
  async grantPermission(@Body() dto: GrantPermissionDto) {
    return this.greenfieldService.grantPermission(
      dto.bucketName,
      dto.objectName,
      dto.grantee,
      dto.actionType,
    );
  }
}
