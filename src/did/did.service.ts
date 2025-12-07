import { Injectable, BadRequestException } from '@nestjs/common';
import { ethers } from 'ethers';

@Injectable()
export class DidService {
  private readonly didPrefix = 'did:bnb:';
  private readonly verificationTimeout = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * DID 문서 생성
   */
  async createDID(walletAddress: string, profileData: any = {}) {
    try {
      const normalizedAddress = ethers.getAddress(walletAddress);
      const didId = `${this.didPrefix}${normalizedAddress.toLowerCase()}`;

      // 공개키 파생 (간소화된 방식: 주소 해시를 사용)
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

      return {
        success: true,
        didDocument,
        didHash: this.generateDIDHash(didDocument),
      };
    } catch (error) {
      console.error('DID creation error:', error);
      throw new BadRequestException(`DID creation failed: ${error.message}`);
    }
  }

  /**
   * DID 검증 (문서 구조, 서명, 소유권)
   */
  async verifyDID(walletAddress: string, didDocument: any, signature: string) {
    try {
      if (!walletAddress || !didDocument || !signature) {
        throw new Error('Missing required parameters');
      }

      const normalizedAddress = ethers.getAddress(walletAddress);

      // 1. 문서 구조 검증
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

      // 2. 지갑 소유권 검증 (서명 확인)
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

      // 3. 진위 여부 (Authenticity) - 생성 시간 등
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

  /**
   * (테스트용) DID ID에 대한 서명 생성
   * 주의: 테스트 목적으로만 사용해야 합니다.
   */
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

  // --- 내부 헬퍼 메서드 ---

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
      // 메시지 원문: DID 문서를 생성한 주체가 맞는지 확인하기 위한 챌린지 메시지
      const message = `Verify ownership of ${didDocument.id}`;

      // 서명 복원
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
    // 키 정렬 후 JSON 문자열화 -> SHA256 해시
    const documentString = JSON.stringify(
      didDocument,
      Object.keys(didDocument).sort(),
    );
    const hashBytes = ethers.sha256(ethers.toUtf8Bytes(documentString));
    return hashBytes.replace('0x', ''); // hex string (without 0x prefix if needed, or keep it)
  }

  private async derivePublicKeyFromAddress(walletAddress: string) {
    // 실제 공개키 도출 대신 주소 해시 사용 (데모용)
    const addressBytes = ethers.getBytes(walletAddress);
    const hash = ethers.sha256(addressBytes);
    return hash.replace('0x', '');
  }
}
