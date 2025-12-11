import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiProperty } from '@nestjs/swagger';
import { DidService } from './did.service';
import { CreateDidDto } from './dto/create-did.dto';
import { VerifyDidDto } from './dto/verify-did.dto';
import { SignDidDto } from './dto/sign-did.dto';

class CreateVpDto {
  @ApiProperty({ description: 'Holder Private Key', example: '0x...' })
  holderPrivateKey: string;

  @ApiProperty({ 
    description: 'List of VCs to include', 
    example: [{ "@context": ["..."], "issuer": "...", "proof": { } }] 
  })
  vcList: any[];
}

class VerifyVpDto {
  @ApiProperty({ 
    description: 'Verifiable Presentation (VP) Object', 
    example: { "@context": ["..."], "type": ["VerifiablePresentation"], "proof": { } } 
  })
  vp: any;
}

class IssueVcDto {
  @ApiProperty({ description: 'DID of the Holder (Receiver)', example: 'did:bnb:0x...' })
  holderDid: string;

  @ApiProperty({ 
    description: 'VC Content (Claims)', 
    example: { age: 25, location: 'Brooklyn' } 
  })
  credentialSubject: Record<string, any>;
}

@ApiTags('did')
@Controller('did')
export class DidController {
  constructor(private readonly didService: DidService) {}

  // ... existing endpoints ...

  @Post('issue-vc')
  @ApiOperation({ summary: 'Issue Verifiable Credential (VC)' })
  @ApiOkResponse({
    description: 'Returns the signed VC and storage URL',
    schema: {
      example: {
        success: true,
        vc: {
          '@context': ['...'],
          issuer: 'did:bnb:0xIssuer...',
          proof: { jws: '0x...' }
        },
        storageUrl: 'https://...',
      },
    },
  })
  async issueVC(@Body() dto: IssueVcDto) {
    return this.didService.issueVC(dto.holderDid, dto.credentialSubject);
  }

  @Post('create-vp')
  @ApiOperation({ summary: 'Create Verifiable Presentation (VP)' })
  @ApiOkResponse({
    description: 'Returns the signed VP',
  })
  async createVP(@Body() dto: CreateVpDto) {
    return this.didService.createVP(dto.holderPrivateKey, dto.vcList);
  }

  @Post('verify-vp')
  @ApiOperation({ summary: 'Verify Verifiable Presentation (VP)' })
  @ApiOkResponse({
    description: 'Verification result',
  })
  async verifyVP(@Body() dto: VerifyVpDto) {
    return this.didService.verifyVP(dto.vp);
  }


  @Post('create')
  @ApiOperation({ summary: 'Create DID Document' })
  @ApiOkResponse({
    description: 'Returns the created DID document',
    schema: {
      example: {
        success: true,
        didDocument: {
          '@context': ['...'],
          id: 'did:bnb:0x...',
        },
        didHash: 'abcdef...',
      },
    },
  })
  async createDID(@Body() dto: CreateDidDto) {
    return this.didService.createDID(dto.walletAddress, dto.profileData);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify DID Document and Signature' })
  @ApiOkResponse({
    description: 'Verification Result',
    schema: {
      example: {
        success: true,
        status: 'verified',
        message: '...',
      },
    },
  })
  async verifyDID(@Body() dto: VerifyDidDto) {
    return this.didService.verifyDID(
      dto.walletAddress,
      dto.didDocument,
      dto.signature,
    );
  }

  @Post('sign-test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test: Generate Signature with PrivateKey (DEV ONLY)' })
  @ApiOkResponse({
    description: 'Returns the signature',
    schema: {
      example: {
        walletAddress: '0x...',
        signature: '0x...',
        message: 'Verify ownership of did:bnb:0x...',
      },
    },
  })
  async signDidMessage(@Body() dto: SignDidDto) {
    return this.didService.signDidMessage(dto.privateKey, dto.didId);
  }
}
