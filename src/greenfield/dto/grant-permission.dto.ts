import { ApiProperty } from '@nestjs/swagger';

export class GrantPermissionDto {
  @ApiProperty({ description: '버킷 이름', example: 'my-test-bucket-123' })
  bucketName: string;

  @ApiProperty({ description: '오브젝트 이름 (버킷 전체 권한일 경우 비워둘 수 있음)', required: false, example: 'test.txt' })
  objectName?: string;

  @ApiProperty({ description: '권한을 받을 사용자 주소 (0x...)', example: '0x123...' })
  grantee: string;

  @ApiProperty({
    description: '권한 타입 (예: GRN_ACTION_READ_OBJECT, GRN_ACTION_CREATE_OBJECT)',
    example: 'GRN_ACTION_READ_OBJECT',
  })
  actionType: string;
}

