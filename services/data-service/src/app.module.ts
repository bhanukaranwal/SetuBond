import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { MarketDataService } from './market-data.service';
import { MarketData } from './entities/market-data.entity';
import { BondInfo } from './entities/bond-info.entity';
import { ExchangeData } from './entities/exchange-data.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT) || 5432,
      username: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      database: process.env.POSTGRES_DB || 'setubond',
      entities: [MarketData, BondInfo, ExchangeData],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([MarketData, BondInfo, ExchangeData]),
  ],
  controllers: [DataController],
  providers: [DataService, MarketDataService],
})
export class AppModule {}
