import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as BNBDIDRegistryABI from './abi/BNBDIDRegistry.json';
import { GreenfieldService } from '../greenfield/greenfield.service';

@Injectable()
export class DidService {
  private readonly didPrefix = 'did:bnb:';
  private readonly verificationTimeout = 24 * 60 * 60 * 1000;
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private issuerWallet: ethers.Wallet;

  constructor(
    private configService: ConfigService,
    private greenfieldService: GreenfieldService,
  ) {
    const rpcUrl = this.configService.get<string>('TESTNET_RPC_URL');
    const testnetPrivKey = this.configService.get<string>('TESTNET_PRIV_KEY'); // 혹은 DID_PRIVATE_KEY
    const registryAddress = this.configService.get<string>('TESTNET_DID_REGISTRY');
    const issuerPrivKey = this.configService.get<string>('ISSUER_PRIV_KEY');

    if (rpcUrl) {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      
      if (testnetPrivKey && registryAddress) {
        this.wallet = new ethers.Wallet(testnetPrivKey, this.provider);
        this.contract = new ethers.Contract(
          registryAddress,
          (BNBDIDRegistryABI as any).default || BNBDIDRegistryABI,
          this.wallet,
        );
      }

      if (issuerPrivKey) {
        this.issuerWallet = new ethers.Wallet(issuerPrivKey, this.provider);
      }
    }
  }

  // ... createDID, verifyDID, signDidMessage ...

  /**
   * Issuer가 VC(Verifiable Credential)를 발급합니다.
   * 1. VC 데이터 생성
   * 2. Issuer 서명 (Proof) 추가
   * 3. Greenfield에 VC JSON 업로드 (vc-bucket)
   */
  async issueVC(holderDid: string, credentialSubject: any) {
    try {
      if (!this.issuerWallet) {
        throw new Error('Issuer wallet not configured');
      }

      const issuerDid = `${this.didPrefix}${this.issuerWallet.address.toLowerCase()}`;
      const issuanceDate = new Date().toISOString();
      const expirationDate = new Date();
      expirationDate.setFullYear(expirationDate.getFullYear() + 1); // 1년 유효

      // 1. VC 데이터 구조 (Unsigned)
      const vcPayload = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          // 추가적인 컨텍스트가 필요하면 여기에 추가
        ],
        id: `http://example.com/credentials/${Date.now()}`, // 고유 VC ID
        type: ['VerifiableCredential', 'IdentityCredential'], // 예시 타입 수정
        issuer: issuerDid,
        issuanceDate: issuanceDate,
        expirationDate: expirationDate.toISOString(),
        credentialSubject: {
          id: holderDid,
          ...credentialSubject, // 예: { age: 25, location: "Brooklyn" }
        },
      };

      // 2. Issuer 서명 생성 (간소화된 EcdsaSecp256k1Signature2019 방식)
      // 실제로는 JSON-LD 정규화(canonicalize) 후 서명해야 하지만, 여기서는 JSON.stringify 후 해시 서명
      const vcString = JSON.stringify(vcPayload);
      const signature = await this.issuerWallet.signMessage(vcString);

      const signedVC = {
        ...vcPayload,
        proof: {
          type: 'EcdsaSecp256k1Signature2019',
          created: issuanceDate,
          proofPurpose: 'assertionMethod',
          verificationMethod: `${issuerDid}#key-1`,
          jws: signature, // 혹은 signatureValue 등 표준에 따라 다름
        },
      };

      // 3. Greenfield에 업로드
      const bucketName = 'vc-bucket';
      const objectName = `vc_${holderDid.replace(/:/g, '_')}_${Date.now()}.json`;
      
      // GreenfieldService를 사용하여 업로드
      await this.greenfieldService.uploadJson(bucketName, objectName, signedVC);
      
      const publicUrl = await this.greenfieldService.getDownloadUrl(bucketName, objectName);

      return {
        success: true,
        vc: signedVC,
        storageUrl: publicUrl,
      };

    } catch (error) {
      console.error('VC Issuance Error:', error);
      throw new BadRequestException(`Failed to issue VC: ${error.message}`);
    }
  }

  /**
   * Holder가 VP(Verifiable Presentation)를 생성합니다.
   * 1. 보유한 VC 포함
   * 2. Holder 서명 (Proof) 추가
   */
  async createVP(holderPrivateKey: string, vcList: any[]) {
    try {
      const holderWallet = new ethers.Wallet(holderPrivateKey);
      const holderDid = `${this.didPrefix}${holderWallet.address.toLowerCase()}`;

      // VP 구조 생성
      const vpPayload = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        verifiableCredential: vcList,
        holder: holderDid, // VP 제출자
      };

      // VP 서명 (Holder가 서명)
      const vpString = JSON.stringify(vpPayload);
      const signature = await holderWallet.signMessage(vpString);

      const signedVP = {
        ...vpPayload,
        proof: {
          type: 'EcdsaSecp256k1Signature2019',
          created: new Date().toISOString(),
          proofPurpose: 'authentication',
          verificationMethod: `${holderDid}#key-1`,
          jws: signature,
        },
      };

      // Greenfield에 VP 업로드
      const bucketName = 'vp-bucket';
      const objectName = `vp_${holderDid.replace(/:/g, '_')}_${Date.now()}.json`;
      
      await this.greenfieldService.uploadJson(bucketName, objectName, signedVP);
      const publicUrl = await this.greenfieldService.getDownloadUrl(bucketName, objectName);

      return {
        success: true,
        vp: signedVP,
        storageUrl: publicUrl,
      };
    } catch (error) {
      console.error('VP Creation Error:', error);
      throw new BadRequestException(`Failed to create VP: ${error.message}`);
    }
  }

  /**
   * Verifier가 VP를 검증합니다.
   * 1. VP 서명 검증 (Holder 확인)
   * 2. 포함된 VC들의 서명 검증 (Issuer 확인)
   * 3. (옵션) VC의 내용(Claims) 검증
   */
  async verifyVP(vp: any) {
    try {
      // 1. VP 구조 확인
      if (!vp.proof || !vp.holder || !Array.isArray(vp.verifiableCredential)) {
        throw new Error('Invalid VP structure');
      }

      // 2. VP 서명 검증 (Holder가 제출한 것인지)
      const vpPayload = { ...vp };
      delete vpPayload.proof; // 서명 제외한 원본 데이터
      const vpString = JSON.stringify(vpPayload);
      
      const recoveredHolderAddress = ethers.verifyMessage(vpString, vp.proof.jws);
      const expectedHolderAddress = vp.holder.replace(this.didPrefix, '');

      if (recoveredHolderAddress.toLowerCase() !== expectedHolderAddress.toLowerCase()) {
        throw new Error('VP Signature verification failed: Holder mismatch');
      }

      // 3. 내부 VC들 검증
      const vcVerificationResults: { id: string; valid: boolean; error?: string }[] = [];
      for (const vc of vp.verifiableCredential) {
        try {
          const isValidVC = await this.verifySingleVC(vc);
          vcVerificationResults.push({ id: vc.id, valid: isValidVC });
        } catch (e) {
          vcVerificationResults.push({ id: vc.id, valid: false, error: e.message });
        }
      }

      const allValid = vcVerificationResults.every((r) => r.valid);

      return {
        success: allValid,
        vpVerified: true,
        vcResults: vcVerificationResults,
      };

    } catch (error) {
      console.error('VP Verification Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async verifySingleVC(vc: any): Promise<boolean> {
    // VC 서명 검증 (Issuer 확인)
    const vcPayload = { ...vc };
    delete vcPayload.proof;
    const vcString = JSON.stringify(vcPayload);

    // Issuer의 공개키/주소 복원
    // 실제로는 Issuer DID Document를 resolve해서 공개키를 가져와야 정석이지만,
    // 여기서는 서명에서 주소를 복원하여 Issuer DID와 일치하는지 확인 (간소화)
    const recoveredIssuerAddress = ethers.verifyMessage(vcString, vc.proof.jws);
    const expectedIssuerAddress = vc.issuer.replace(this.didPrefix, '');

    if (recoveredIssuerAddress.toLowerCase() !== expectedIssuerAddress.toLowerCase()) {
      throw new Error(`VC Signature mismatch for ${vc.id}`);
    }

    // (옵션) 만료일 확인
    if (vc.expirationDate && new Date(vc.expirationDate) < new Date()) {
      throw new Error(`VC expired: ${vc.id}`);
    }

    return true;
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
