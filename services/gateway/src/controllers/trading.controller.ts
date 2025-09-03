import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GetUser } from '../auth/get-user.decorator';
import { CreateOrderDto, UpdateOrderDto, TradeRequestDto } from '../dto/trading.dto';
import { Observable } from 'rxjs';

interface TradingService {
  createOrder(data: any): Observable<any>;
  getOrder(data: any): Observable<any>;
  updateOrder(data: any): Observable<any>;
  cancelOrder(data: any): Observable<any>;
  getOrderBook(data: any): Observable<any>;
  getUserOrders(data: any): Observable<any>;
  executeRfq(data: any): Observable<any>;
  getMarketData(data: any): Observable<any>;
}

@ApiTags('Trading')
@Controller('trading')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TradingController {
  private tradingService: TradingService;

  constructor(@Inject('TRADING_SERVICE') private client: ClientGrpc) {}

  onModuleInit() {
    this.tradingService = this.client.getService<TradingService>('TradingService');
  }

  @Post('orders')
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @Roles('INVESTOR', 'TRADER', 'INSTITUTIONAL')
  async createOrder(@Body() createOrderDto: CreateOrderDto, @GetUser() user: any) {
    const orderData = {
      ...createOrderDto,
      userId: user.id,
      timestamp: new Date().toISOString(),
    };
    return this.tradingService.createOrder(orderData);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order details retrieved' })
  async getOrder(@Param('id') id: string, @GetUser() user: any) {
    return this.tradingService.getOrder({ id, userId: user.id });
  }

  @Put('orders/:id')
  @ApiOperation({ summary: 'Update order' })
  @ApiResponse({ status: 200, description: 'Order updated successfully' })
  @Roles('INVESTOR', 'TRADER', 'INSTITUTIONAL')
  async updateOrder(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @GetUser() user: any
  ) {
    return this.tradingService.updateOrder({
      id,
      userId: user.id,
      ...updateOrderDto,
    });
  }

  @Delete('orders/:id')
  @ApiOperation({ summary: 'Cancel order' })
  @ApiResponse({ status: 200, description: 'Order cancelled successfully' })
  @Roles('INVESTOR', 'TRADER', 'INSTITUTIONAL')
  async cancelOrder(@Param('id') id: string, @GetUser() user: any) {
    return this.tradingService.cancelOrder({ id, userId: user.id });
  }

  @Get('orderbook/:bondId')
  @ApiOperation({ summary: 'Get order book for a bond' })
  @ApiResponse({ status: 200, description: 'Order book retrieved' })
  async getOrderBook(@Param('bondId') bondId: string) {
    return this.tradingService.getOrderBook({ bondId });
  }

  @Get('orders')
  @ApiOperation({ summary: 'Get user orders' })
  @ApiResponse({ status: 200, description: 'User orders retrieved' })
  async getUserOrders(
    @GetUser() user: any,
    @Query('status') status?: string,
    @Query('bondId') bondId?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20
  ) {
    return this.tradingService.getUserOrders({
      userId: user.id,
      status,
      bondId,
      page,
      limit,
    });
  }

  @Post('rfq')
  @ApiOperation({ summary: 'Create RFQ (Request for Quote)' })
  @ApiResponse({ status: 201, description: 'RFQ created successfully' })
  @Roles('INSTITUTIONAL', 'TRADER')
  async createRfq(@Body() tradeRequestDto: TradeRequestDto, @GetUser() user: any) {
    return this.tradingService.executeRfq({
      ...tradeRequestDto,
      userId: user.id,
      type: 'RFQ',
    });
  }

  @Get('market-data/:bondId')
  @ApiOperation({ summary: 'Get real-time market data' })
  @ApiResponse({ status: 200, description: 'Market data retrieved' })
  async getMarketData(@Param('bondId') bondId: string) {
    return this.tradingService.getMarketData({ bondId });
  }
}
