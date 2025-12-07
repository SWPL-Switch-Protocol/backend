import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import * as fs from 'node:fs';
import path from 'node:path';
import { GreenfieldModule } from './greenfield/greenfield.module';
import { DidModule } from './did/did.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASS'),
        database: config.get<string>('DB_NAME'),
        ssl: {
          ca: fs
            .readFileSync(
              path.resolve(
                process.cwd(),
                <string>config.get('B_CA_CERT_PATH'),
              ),
            )
            .toString(),
          rejectUnauthorized: true,
        },
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    HealthModule,
    GreenfieldModule,
    DidModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
