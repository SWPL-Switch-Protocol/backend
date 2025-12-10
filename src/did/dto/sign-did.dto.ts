import { ApiProperty } from '@nestjs/swagger';

export class SignDidDto {
  @ApiProperty({ description: 'Wallet Private Key (Warning: For testing only!)', example: '0x...' })
  privateKey: string;

  @ApiProperty({ description: 'DID ID', example: 'did:bnb:0x...' })
  didId: string;
}
