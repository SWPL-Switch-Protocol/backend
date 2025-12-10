import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { DidService } from './did.service';
import { CreateDidDto } from './dto/create-did.dto';
import { VerifyDidDto } from './dto/verify-did.dto';
import { SignDidDto } from './dto/sign-did.dto';

@ApiTags('did')
@Controller('did')
export class DidController {
  constructor(private readonly didService: DidService) {}

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
