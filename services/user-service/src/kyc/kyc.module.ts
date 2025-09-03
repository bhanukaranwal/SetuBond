import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { KycDocument } from './entities/kyc-document.entity';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { DigitalVerificationService } from './digital-verification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycDocument]),
    HttpModule,
  ],
  controllers: [KycController],
  providers: [KycService, DigitalVerificationService],
  exports: [KycService],
})
export class KycModule {}
