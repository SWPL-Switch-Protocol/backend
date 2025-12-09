import { Injectable, OnModuleInit, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, PermissionTypes, VisibilityType, RedundancyType, bytesFromBase64 } from '@bnb-chain/greenfield-js-sdk';
import { NodeAdapterReedSolomon } from '@bnb-chain/reed-solomon/node.adapter';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscGreenfield } from 'viem/chains'; // viem 체인 설정 (없으면 custom chain 설정 필요)
import * as fs from 'fs';
import Long from 'long';

@Injectable()
export class GreenfieldService implements OnModuleInit {
  private client: Client;
  private account: any;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const rpcUrl = this.configService.get<string>('GREENFIELD_RPC_URL');
    const chainId = this.configService.get<string>('GREENFIELD_CHAIN_ID');
    const privateKey = this.configService.get<string>('GREENFIELD_PRIV_KEY');

    if (!rpcUrl || !chainId || !privateKey) {
      console.warn('Greenfield 환경변수가 설정되지 않았습니다.');
      return;
    }

    // 1. Greenfield Client 초기화
    this.client = Client.create(rpcUrl, chainId);

    // 2. Viem Account 초기화 (서명용)
    // PRIVATE_KEY는 0x로 시작해야 함
    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    console.log(this.account.address);
  }

  // 버킷 생성
  async createBucket(bucketName: string) {
    const creator = this.account.address;
    console.log(`Creating bucket ${bucketName}, creator: ${creator}`);

    try {
      // 트랜잭션 구성
      const createBucketTx = await this.client.bucket.createBucket({
        bucketName: bucketName,
        creator: creator,
        visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ, // 기본 공개 읽기
        chargedReadQuota: Long.fromString('0'),
        paymentAddress: creator,
        primarySpAddress: await this.getPrimarySp(),
      });
      console.log('createBucketTx', createBucketTx);

      // 트랜잭션 시뮬레이션
      const simulateInfo = await createBucketTx.simulate({
        denom: 'BNB',
      });

      // 트랜잭션 브로드캐스트
      const res = await createBucketTx.broadcast({
        denom: 'BNB',
        gasLimit: Number(simulateInfo?.gasLimit),
        gasPrice: simulateInfo?.gasPrice || '5000000000',
        payer: creator,
        granter: '',
        privateKey: this.configService.get<string>('GREENFIELD_PRIV_KEY'), // SDK가 내부적으로 서명 처리 (hex string)
      });

      return res;
    } catch (error: any) {
      // 버킷 중복 생성 에러 처리
      if (
        error.message &&
        (error.message.includes('Bucket already exists') ||
          error.message.includes('bucket already exists'))
      ) {
        throw new ConflictException(`Bucket '${bucketName}' already exists.`);
      }
      // 그 외 에러는 그대로 던짐
      throw error;
    }
  }

  // 파일 업로드
  async uploadFile(bucketName: string, objectName: string, fileBuffer: Buffer, mimetype: string) {
    const creator = this.account.address;
    const privKey = this.configService.get<string>('GREENFIELD_PRIV_KEY');
    console.log(`uploadFile to ${bucketName}/${objectName}, creator: ${creator}`);

    // 0. 체크섬 계산 (Reed-Solomon) - NodeAdapter 사용
    const rs = new NodeAdapterReedSolomon();
    // encodeInWorker 대신 encodeInSubWorker 사용 (라이브러리 내부 워커 사용)
    const expectCheckSums = await rs.encodeInSubWorker(Uint8Array.from(fileBuffer));

    console.log('Checksums generated:', expectCheckSums.length);

    // 1. 오브젝트 생성 트랜잭션
    const createObjectTx = await this.client.object.createObject({
      bucketName: bucketName,
      objectName: objectName,
      creator: creator,
      visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
      contentType: mimetype,
      redundancyType: RedundancyType.REDUNDANCY_EC_TYPE,
      payloadSize: Long.fromInt(fileBuffer.length),
      expectChecksums: expectCheckSums.map((x: string) => bytesFromBase64(x)),
    });

    let createRes;
    try {
      // 시뮬레이션 및 브로드캐스트 (오브젝트 메타데이터 생성)
      const simulateInfo = await createObjectTx.simulate({ denom: 'BNB' });
      createRes = await createObjectTx.broadcast({
        denom: 'BNB',
        gasLimit: Number(simulateInfo?.gasLimit),
        gasPrice: simulateInfo?.gasPrice || '5000000000',
        payer: creator,
        granter: '',
        privateKey: this.configService.get<string>('GREENFIELD_PRIV_KEY'),
      });

      if (createRes.code !== 0) {
        throw new Error(`Create Object Failed: ${createRes.message}`);
      }
    } catch (error: any) {
      if (error.message && error.message.includes('Object already exists')) {
        throw new ConflictException(`Object '${objectName}' already exists in bucket '${bucketName}'.`);
      }
      throw error;
    }

    console.log('Create Object Success, txnHash:', createRes.transactionHash);

    // 2. 실제 파일 데이터 업로드 (SP로 전송)
    const uploadRes = await this.client.object.uploadObject(
      {
        bucketName: bucketName,
        objectName: objectName,
        body: fileBuffer, // Node.js 환경에서는 Buffer 지원 확인 필요. 아니면 Blob/ReadableStream 변환
        txnHash: createRes.transactionHash,
      },
      // 인증 정보 (V2 SDK에서는 authType 등 옵션 확인 필요)
      {
        type: 'ECDSA', // or ECDSA depending on key type
        address: creator,
        domain: 'http://localhost', // Node.js 환경용 더미 도메인
        seed: createRes.transactionHash, // 임시 시드
        privateKey: this.configService.get<string>('GREENFIELD_PRIV_KEY'),
      }
    );

    return uploadRes;
  }

  // 파일 다운로드 (URL 생성 방식)
  // SP에서 직접 다운로드하려면 서명된 URL 혹은 공개 URL 필요
  async getDownloadUrl(bucketName: string, objectName: string) {
    // 공개 버킷이라 가정하면 SP 엔드포인트 조합해서 리턴
    // 실제로는 headObject 등으로 SP 위치 확인 후 URL 조합
    const sp = await this.getPrimarySp();
    // 예: https://gnfd-testnet-sp1.bnbchain.org/view/{bucket}/{object}
    // 정확한 SP 엔드포인트 매핑이 필요함. 여기서는 예시 리턴.
    return `https://${bucketName}.${sp.replace('https://', '')}/${objectName}`;
  }

  // 권한 부여
  async grantPermission(bucketName: string, objectName: string | undefined, grantee: string, action: string) {
    const operator = this.account.address;

    // 액션 타입 매핑 (문자열 -> SDK Enum)
    // 예: PermissionTypes.ActionType.ACTION_UPDATE_OBJECT_INFO
    // 여기서는 사용자가 문자열로 넘긴다고 가정 (GRN_...)

    const tx = await this.client.bucket.putBucketPolicy(
      bucketName,
      {
        operator: operator,
        statements: [
          {
            effect: PermissionTypes.Effect.EFFECT_ALLOW,
            actions: [action as any], // 타입 캐스팅 필요
            resources: [`grn:o::${bucketName}/${objectName || '*'}`],
          },
        ],
      }
    );

    // 시뮬레이션 & 브로드캐스트
    const simulateInfo = await tx.simulate({ denom: 'BNB' });
    const res = await tx.broadcast({
      denom: 'BNB',
      gasLimit: Number(simulateInfo?.gasLimit),
      gasPrice: simulateInfo?.gasPrice || '5000000000',
      payer: operator,
      granter: '',
      privateKey: this.configService.get<string>('GREENFIELD_PRIV_KEY'),
    });

    return res;
  }

  // 헬퍼: Primary SP 주소 가져오기
  private async getPrimarySp() {
    const sps = await this.client.sp.getStorageProviders();
    // 첫 번째 SP를 Primary로 사용 (실제로는 선택 로직 필요)
    return sps[0].operatorAddress; // 혹은 endpoint
  }
}
