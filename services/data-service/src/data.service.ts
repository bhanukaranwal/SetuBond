import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketData } from './entities/market-data.entity';
import { BondInfo } from './entities/bond-info.entity';
import { MarketDataService } from './market-data.service';
import { subDays } from 'date-fns';

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);

  constructor(
    @InjectRepository(MarketData)
    private marketDataRepository: Repository<MarketData>,
    @InjectRepository(BondInfo)
    private bondInfoRepository: Repository<BondInfo>,
    private marketDataService: MarketDataService,
  ) {}

  async getLatestMarketData(isin: string, exchange?: string) {
    const queryBuilder = this.marketDataRepository
      .createQueryBuilder('md')
      .where('md.isin = :isin', { isin })
      .orderBy('md.timestamp', 'DESC')
      .limit(1);

    if (exchange) {
      queryBuilder.andWhere('md.exchange = :exchange', { exchange });
    }

    const data = await queryBuilder.getOne();
    return data || {};
  }

  async getHistoricalData(isin: string, days: number = 30) {
    const startDate = subDays(new Date(), days);
    
    const data = await this.marketDataRepository.find({
      where: {
        isin,
        timestamp: Between(startDate, new Date()),
      },
      order: { timestamp: 'ASC' },
    });

    return { data };
  }

  async getBondInfo(isin: string) {
    const bondInfo = await this.bondInfoRepository.findOne({
      where: { isin },
    });

    if (!bondInfo) {
      return { error: 'Bond not found' };
    }

    return bondInfo;
  }

  async searchBonds(query: string, filters: any = {}) {
    const queryBuilder = this.bondInfoRepository
      .createQueryBuilder('bond')
      .where('bond.name ILIKE :query OR bond.issuer ILIKE :query', { 
        query: `%${query}%` 
      });

    if (filters.sector) {
      queryBuilder.andWhere('bond.sector = :sector', { sector: filters.sector });
    }

    if (filters.rating) {
      queryBuilder.andWhere('bond.creditRating = :rating', { rating: filters.rating });
    }

    if (filters.minYield) {
      queryBuilder.andWhere('bond.couponRate >= :minYield', { minYield: filters.minYield });
    }

    if (filters.maxYield) {
      queryBuilder.andWhere('bond.couponRate <= :maxYield', { maxYield: filters.maxYield });
    }

    const bonds = await queryBuilder.limit(50).getMany();
    return { bonds };
  }

  async getMarketSummary() {
    const summary = await this.marketDataRepository
      .createQueryBuilder('md')
      .select([
        'COUNT(*) as total_bonds',
        'SUM(md.volume) as total_volume',
        'AVG(md.price) as avg_price',
        'AVG(md.yield) as avg_yield',
      ])
      .where('md.timestamp >= :yesterday', { 
        yesterday: subDays(new Date(), 1) 
      })
      .getRawOne();

    return {
      totalBonds: parseInt(summary.total_bonds),
      totalVolume: parseFloat(summary.total_volume) || 0,
      averagePrice: parseFloat(summary.avg_price) || 0,
      averageYield: parseFloat(summary.avg_yield) || 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async fetchMarketData() {
    try {
      await this.marketDataService.fetchFromNSE();
      await this.marketDataService.fetchFromBSE();
      this.logger.log('Market data fetch completed');
    } catch (error) {
      this.logger.error('Market data fetch failed:', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldData() {
    const thirtyDaysAgo = subDays(new Date(), 30);
    
    await this.marketDataRepository.delete({
      timestamp: Between(new Date('1970-01-01'), thirtyDaysAgo),
    });
    
    this.logger.log('Old market data cleaned up');
  }
}
