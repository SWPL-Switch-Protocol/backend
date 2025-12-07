import { ApiProperty } from '@nestjs/swagger';

export class CreateDidDto {
  @ApiProperty({ description: '지갑 주소', example: '0x123...' })
  walletAddress: string;

  @ApiProperty({
    description: '프로필 데이터 (선택)',
    required: false,
    example: { name: 'John Doe', greenfieldProfileHash: 'hash...' },
  })
  profileData?: Record<string, any>;
}

