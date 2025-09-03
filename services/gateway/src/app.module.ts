import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

import { AuthModule } from './auth/auth.module';
import { UserController } from './controllers/user.controller';
import { TradingController } from './controllers/trading.controller';
import { DataController } from './controllers/data.controller';
import { AIController } from './controllers/ai.controller';
import { BlockchainController } from './controllers/blockchain.controller';
import { ComplianceController } from './controllers/compliance.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
    ClientsModule.register([
      {
        name: 'USER_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'user',
          protoPath: join(__dirname, '../../../shared/proto/user.proto'),
          url: 'localhost:50051',
        },
      },
      {
        name: 'TRADING_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'trading',
          protoPath: join(__dirname, '../../../shared/proto/trading.proto'),
          url: 'localhost:50052',
        },
      },
      {
        name: 'DATA_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'data',
          protoPath: join(__dirname, '../../../shared/proto/data.proto'),
          url: 'localhost:50053',
        },
      },
      {
        name: 'AI_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'ai',
          protoPath: join(__dirname, '../../../shared/proto/ai.proto'),
          url: 'localhost:50054',
        },
      },
      {
        name: 'BLOCKCHAIN_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'blockchain',
          protoPath: join(__dirname, '../../../shared/proto/blockchain.proto'),
          url: 'localhost:50055',
        },
      },
      {
        name: 'COMPLIANCE_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'compliance',
          protoPath: join(__dirname, '../../../shared/proto/compliance.proto'),
          url: 'localhost:50056',
        },
      },
    ]),
    AuthModule,
  ],
  controllers: [
    UserController,
    TradingController,
    DataController,
    AIController,
    BlockchainController,
    ComplianceController,
  ],
})
export class AppModule {}
