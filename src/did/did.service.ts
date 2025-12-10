import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as BNBDIDRegistryABI from './abi/BNBDIDRegistry.json';

@Injectable()
export class DidService {
  private readonly didPrefix = 'did:bnb:';
  private readonly verificationTimeout = 24 * 60 * 60 * 1000;
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;

  constructor(private configService: ConfigService) {
    const rpcUrl = this.configService.get<string>('TESTNET_RPC_URL');
    const testnetPrivKey = this.configService.get<string>('TESTNET_PRIV_KEY'); // 혹은 DID_PRIVATE_KEY
    const registryAddress = this.configService.get<string>('TESTNET_DID_REGISTRY');

    if (rpcUrl && testnetPrivKey && registryAddress) {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(testnetPrivKey, this.provider);
      this.contract = new ethers.Contract(
        registryAddress,
        (BNBDIDRegistryABI as any).default || BNBDIDRegistryABI,
        this.wallet,
      );
    }
  }

  async createDID(walletAddress: string, profileData: any = {}) {
    try {
      const normalizedAddress = ethers.getAddress(walletAddress);
      const didId = `${this.didPrefix}${normalizedAddress.toLowerCase()}`;

      const publicKey = await this.derivePublicKeyFromAddress(normalizedAddress);

      const didDocument = {
        '@context': [
          'https://www.w3.org/ns/did/v1',
          'https://w3id.org/security/suites/secp256k1-2019/v1',
        ],
        id: didId,
        verificationMethod: [
          {
            id: `${didId}#key-1`,
            type: 'EcdsaSecp256k1VerificationKey2019',
            controller: didId,
            publicKeyHex: publicKey,
          },
        ],
        authentication: [`${didId}#key-1`],
        service: [
          {
            id: `${didId}#profile`,
            type: 'UserProfile',
            serviceEndpoint: profileData.greenfieldProfileHash || '',
            description: 'Decentralized profile storage',
          },
        ],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        proof: {
          type: 'EcdsaSecp256k1Signature2019',
          created: new Date().toISOString(),
          verificationMethod: `${didId}#key-1`,
          proofPurpose: 'assertionMethod',
        },
      };

      const didHash = this.generateDIDHash(didDocument);

      // Blockchain에 기록 (registerDID)
      if (this.contract) {
        try {
          // JSON.stringify시 키 정렬 등을 통해 일관된 문자열 생성
          const documentString = JSON.stringify(didDocument, Object.keys(didDocument).sort());
          
          // ethers.id(documentString)은 keccak256(toUtf8Bytes(documentString))과 동일 (Solidity keccak256(bytes(document))와 일치)
          const documentHashBytes32 = ethers.id(documentString);

          console.log(`Registering DID on-chain... Addr: ${normalizedAddress}`);
          const tx = await this.contract.registerDID(documentString, documentHashBytes32);
          console.log(`Transaction sent: ${tx.hash}`);
          await tx.wait(); // 트랜잭션 마이닝 대기
          console.log(`DID Registered successfully on-chain.`);
        } catch (chainError) {
          console.error('Failed to register DID on-chain:', chainError);
          // 온체인 실패 시 전체 실패로 처리할지, 오프체인 생성만 반환할지 결정 필요
          // 여기서는 에러 로그만 남기고 진행 (혹은 throw하여 중단 가능)
        }
      }

      return {
        success: true,
        didDocument,
        didHash: didHash,
      };
    } catch (error) {
      console.error('DID creation error:', error);
      throw new BadRequestException(`DID creation failed: ${error.message}`);
    }
  }

  async verifyDID(walletAddress: string, didDocument: any, signature: string) {
    try {
      if (!walletAddress || !didDocument || !signature) {
        throw new Error('Missing required parameters');
      }

      const normalizedAddress = ethers.getAddress(walletAddress);

      const docValidation = this.validateDIDDocument(
        didDocument,
        normalizedAddress,
      );
      if (!docValidation.isValid) {
        return {
          success: false,
          error: `Invalid DID document: ${docValidation.error}`,
          status: 'failed',
        };
      }

      const ownershipValidation = await this.verifyWalletOwnership(
        normalizedAddress,
        didDocument,
        signature,
      );
      if (!ownershipValidation.isValid) {
        return {
          success: false,
          error: `Wallet ownership verification failed: ${ownershipValidation.error}`,
          status: 'failed',
        };
      }

      const authValidation = await this.verifyDIDAuthenticity(didDocument);
      if (!authValidation.isValid) {
        return {
          success: false,
          error: `DID authenticity verification failed: ${authValidation.error}`,
          status: 'failed',
        };
      }

      return {
        success: true,
        status: 'verified',
        didHash: this.generateDIDHash(didDocument),
        verificationDate: new Date(),
        message: 'BNB DID verification completed successfully',
      };
    } catch (error) {
      console.error('BNB DID verification error:', error);
      return {
        success: false,
        error: error.message,
        status: 'error',
      };
    }
  }

  async signDidMessage(privateKey: string, didId: string) {
    try {
      const wallet = new ethers.Wallet(privateKey);
      const message = `Verify ownership of ${didId}`;
      const signature = await wallet.signMessage(message);

      return {
        walletAddress: wallet.address,
        signature,
        message,
      };
    } catch (error) {
      console.error('Sign error:', error);
      throw new BadRequestException(`Failed to sign message: ${error.message}`);
    }
  }

  private validateDIDDocument(didDocument: any, expectedAddress: string) {
    try {
      const requiredFields = ['@context', 'id', 'verificationMethod'];
      for (const field of requiredFields) {
        if (!didDocument[field]) {
          return { isValid: false, error: `Missing required field: ${field}` };
        }
      }

      if (!didDocument.id.startsWith(this.didPrefix)) {
        return {
          isValid: false,
          error: 'Invalid DID format - must start with did:bnb:',
        };
      }

      const didAddress = didDocument.id.replace(this.didPrefix, '');
      if (didAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
        return {
          isValid: false,
          error: 'DID address does not match provided wallet address',
        };
      }

      if (
        !Array.isArray(didDocument.verificationMethod) ||
        didDocument.verificationMethod.length === 0
      ) {
        return {
          isValid: false,
          error: 'Invalid or missing verification method',
        };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: error.message };
    }
  }

  private async verifyWalletOwnership(
    walletAddress: string,
    didDocument: any,
    signature: string,
  ) {
    try {
      const message = `Verify ownership of ${didDocument.id}`;

      const recoveredAddress = ethers.verifyMessage(message, signature);

      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return {
          isValid: false,
          error: `Signature verification failed. Recovered: ${recoveredAddress}, Expected: ${walletAddress}.`,
        };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: error.message };
    }
  }

  private async verifyDIDAuthenticity(didDocument: any) {
    try {
      const createdTime = new Date(didDocument.created).getTime();
      const currentTime = new Date().getTime();

      if (currentTime - createdTime > this.verificationTimeout) {
        return {
          isValid: false,
          error: 'DID document is too old (verification timeout)',
        };
      }
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: error.message };
    }
  }

  private generateDIDHash(didDocument: any): string {
    const documentString = JSON.stringify(
      didDocument,
      Object.keys(didDocument).sort(),
    );
    const hashBytes = ethers.sha256(ethers.toUtf8Bytes(documentString));
    return hashBytes.replace('0x', '');
  }

  private async derivePublicKeyFromAddress(walletAddress: string) {
    const addressBytes = ethers.getBytes(walletAddress);
    const hash = ethers.sha256(addressBytes);
    return hash.replace('0x', '');
  }
}
