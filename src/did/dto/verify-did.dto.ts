import { ApiProperty } from '@nestjs/swagger';

export class VerifyDidDto {
  @ApiProperty({ description: '지갑 주소', example: '0x123...' })
  walletAddress: string;

  @ApiProperty({
    description: 'DID 문서 객체',
    example: {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:bnb:0x123...',
      // ...
    },
  })
  didDocument: any;

  @ApiProperty({
    description: '지갑 소유권 증명을 위한 서명 값',
    example: '0xsignature...',
  })
  signature: string;
}

