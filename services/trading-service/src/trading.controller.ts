import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { TradingService } from './trading.service';
import { CreateOrderDto, UpdateOrderDto } from './dto/trading.dto';

@Controller()
export class TradingController {
  constructor(private readonly tradingService: TradingService) {}

  @GrpcMethod('TradingService', 'CreateOrder')
  async createOrder(data: any) {
    return this.tradingService.createOrder(data.userId, data);
  }

  @GrpcMethod('TradingService', 'GetOrder')
  async getOrder(data: any) {
    return this.tradingService.getOrder(data.id, data.userId);
  }

  @GrpcMethod('TradingService', 'UpdateOrder')
  async updateOrder(data: any) {
    return this.tradingService.updateOrder(data.id, data.userId, data);
  }

  @GrpcMethod('TradingService', 'CancelOrder')
  async cancelOrder(data: any) {
    return this.tradingService.cancelOrder(data.id, data.userId);
  }

  @GrpcMethod('TradingService', 'GetOrderBook')
  async getOrderBook(data: any) {
    return this.tradingService.getOrderBook(data.bondId);
  }

  @GrpcMethod('TradingService', 'GetUserOrders')
  async getUserOrders(data: any) {
    return this.tradingService.getUserOrders(data.userId, data);
  }

  @GrpcMethod('TradingService', 'ExecuteRfq')
  async executeRfq(data: any) {
    // RFQ implementation
    return { id: 'rfq-123', status: 'CREATED', quotes: [] };
  }

  @GrpcMethod('TradingService', 'GetMarketData')
  async getMarketData(data: any) {
    // Market data implementation
    return {
      bondId: data.bondId,
      lastPrice: 100.50,
      volume: 1000,
      timestamp: new Date().toISOString(),
    };
  }
}
