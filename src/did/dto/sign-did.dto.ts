import { ApiProperty } from '@nestjs/swagger';

export class SignDidDto {
  @ApiProperty({ description: '지갑 프라이빗 키 (테스트용 주의!)', example: '0x...' })
  privateKey: string;

  @ApiProperty({ description: 'DID ID', example: 'did:bnb:0x...' })
  didId: string;
}

