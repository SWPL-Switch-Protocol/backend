import { ApiProperty } from '@nestjs/swagger';

export class CreateBucketDto {
  @ApiProperty({ description: 'Bucket Name to create', example: 'my-test-bucket-123' })
  bucketName: string;
}
