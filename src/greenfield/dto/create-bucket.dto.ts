import { ApiProperty } from '@nestjs/swagger';

export class CreateBucketDto {
  @ApiProperty({ description: '생성할 버킷 이름', example: 'my-test-bucket-123' })
  bucketName: string;
}

