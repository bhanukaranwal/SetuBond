import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { DataService } from './data.service';

@Controller()
export class DataController {
  constructor(private readonly dataService: DataService) {}

  @GrpcMethod('DataService', 'GetMarketData')
  async getMarketData(data: { isin: string; exchange?: string }) {
    return this.dataService.getLatestMarketData(data.isin, data.exchange);
  }

  @GrpcMethod('DataService', 'GetHistoricalData')
  async getHistoricalData(data: { isin: string; days: number }) {
    return this.dataService.getHistoricalData(data.isin, data.days);
  }

  @GrpcMethod('DataService', 'GetBondInfo')
  async getBondInfo(data: { isin: string }) {
    return this.dataService.getBondInfo(data.isin);
  }

  @GrpcMethod('DataService', 'SearchBonds')
  async searchBonds(data: { query: string; filters?: any }) {
    return this.dataService.searchBonds(data.query, data.filters);
  }

  @GrpcMethod('DataService', 'GetMarketSummary')
  async getMarketSummary() {
    return this.dataService.getMarketSummary();
  }
}
