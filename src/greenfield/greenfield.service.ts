import { Injectable, OnModuleInit, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, PermissionTypes, VisibilityType, RedundancyType, bytesFromBase64 } from '@bnb-chain/greenfield-js-sdk';
import { NodeAdapterReedSolomon } from '@bnb-chain/reed-solomon/node.adapter';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscGreenfield } from 'viem/chains';
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

    this.client = Client.create(rpcUrl, chainId);

    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    console.log(this.account.address);
  }

  async createBucket(bucketName: string) {
    const creator = this.account.address;
    console.log(`Creating bucket ${bucketName}, creator: ${creator}`);

    try {
      const createBucketTx = await this.client.bucket.createBucket({
        bucketName: bucketName,
        creator: creator,
        visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
        chargedReadQuota: Long.fromString('0'),
        paymentAddress: creator,
        primarySpAddress: await this.getPrimarySp(),
      });
      console.log('createBucketTx', createBucketTx);

      const simulateInfo = await createBucketTx.simulate({
        denom: 'BNB',
      });

      const res = await createBucketTx.broadcast({
        denom: 'BNB',
        gasLimit: Number(simulateInfo?.gasLimit),
        gasPrice: simulateInfo?.gasPrice || '5000000000',
        payer: creator,
        granter: '',
        privateKey: this.configService.get<string>('GREENFIELD_PRIV_KEY'),
      });

      return res;
    } catch (error: any) {
      if (
        error.message &&
        (error.message.includes('Bucket already exists') ||
          error.message.includes('bucket already exists'))
      ) {
        throw new ConflictException(`Bucket '${bucketName}' already exists.`);
      }
      throw error;
    }
  }

  async uploadFile(bucketName: string, objectName: string, fileBuffer: Buffer, mimetype: string) {
    const creator = this.account.address;
    console.log(`uploadFile to ${bucketName}/${objectName}, creator: ${creator}`);

    const rs = new NodeAdapterReedSolomon();
    const expectCheckSums = await rs.encodeInSubWorker(Uint8Array.from(fileBuffer));

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

    const uploadRes = await this.client.object.uploadObject(
      {
        bucketName: bucketName,
        objectName: objectName,
        body: fileBuffer,
        txnHash: createRes.transactionHash,
      },
      {
        type: 'ECDSA',
        address: creator,
        domain: 'http://localhost',
        seed: createRes.transactionHash,
        privateKey: this.configService.get<string>('GREENFIELD_PRIV_KEY'),
      }
    );

    return uploadRes;
  }

  async uploadJson(bucketName: string, objectName: string, jsonData: Record<string, any>) {
    const jsonString = JSON.stringify(jsonData);
    const buffer = Buffer.from(jsonString);
    return this.uploadFile(bucketName, objectName, buffer, 'application/json');
  }

  async getDownloadUrl(bucketName: string, objectName: string) {
    const sp = await this.getPrimarySp();
    return `https://${bucketName}.${sp.replace('https://', '')}/${objectName}`;
  }

  async grantPermission(bucketName: string, objectName: string | undefined, grantee: string, action: string) {
    const operator = this.account.address;

    const tx = await this.client.bucket.putBucketPolicy(
      bucketName,
      {
        operator: operator,
        statements: [
          {
            effect: PermissionTypes.Effect.EFFECT_ALLOW,
            actions: [action as any],
            resources: [`grn:o::${bucketName}/${objectName || '*'}`],
          },
        ],
      }
    );

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

  private async getPrimarySp() {
    const sps = await this.client.sp.getStorageProviders();
    return sps[0].operatorAddress;
  }
}
