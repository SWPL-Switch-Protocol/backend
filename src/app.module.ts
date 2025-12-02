import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // ConfigModule.forRoot({
    //   isGlobal: true,
    //   envFilePath: ['.env'],
    // }),
    // TypeOrmModule.forRootAsync({
    //   inject: [ConfigService],
    //   useFactory: (config: ConfigService) => ({
    //     type: 'postgres',
    //     host: config.get<string>('DB_HOST'),
    //     port: config.get<number>('DB_PORT'),
    //     username: config.get<string>('DB_USER'),
    //     password: config.get<string>('DB_PASS'),
    //     database: config.get<string>('DB_NAME'),
    //     autoLoadEntities: true,
    //     synchronize: true,
    //   }),
    // }),
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
