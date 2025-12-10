import { ApiProperty } from '@nestjs/swagger';

export class VerifyDidDto {
  @ApiProperty({ description: 'Wallet Address', example: '0x123...' })
  walletAddress: string;

  @ApiProperty({
    description: 'DID Document Object',
    example: {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:bnb:0x123...',
    },
  })
  didDocument: any;

  @ApiProperty({
    description: 'Signature for Wallet Ownership Proof',
    example: '0xsignature...',
  })
  signature: string;
}
