import { ApiProperty } from '@nestjs/swagger';

export class GrantPermissionDto {
  @ApiProperty({ description: 'Bucket Name', example: 'my-test-bucket-123' })
  bucketName: string;

  @ApiProperty({ description: 'Object Name (Can be empty for bucket-wide permissions)', required: false, example: 'test.txt' })
  objectName?: string;

  @ApiProperty({ description: 'Grantee Address (0x...)', example: '0x123...' })
  grantee: string;

  @ApiProperty({
    description: 'Permission Type (e.g., GRN_ACTION_READ_OBJECT, GRN_ACTION_CREATE_OBJECT)',
    example: 'GRN_ACTION_READ_OBJECT',
  })
  actionType: string;
}
