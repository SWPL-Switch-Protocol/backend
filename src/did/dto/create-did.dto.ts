import { ApiProperty } from '@nestjs/swagger';

export class CreateDidDto {
  @ApiProperty({ description: 'Wallet Address', example: '0x123...' })
  walletAddress: string;

  @ApiProperty({
    description: 'Profile Data (Optional)',
    required: false,
    example: { name: 'John Doe', greenfieldProfileHash: 'hash...' },
  })
  profileData?: Record<string, any>;
}
