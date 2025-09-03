import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { Trade } from './entities/trade.entity';
import { MatchingEngineService } from './matching-engine/matching-engine.service';
import { CreateOrderDto, UpdateOrderDto } from './dto/trading.dto';

@Injectable()
export class TradingService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Trade)
    private tradeRepository: Repository<Trade>,
    private matchingEngine: MatchingEngineService,
  ) {}

  async createOrder(userId: string, createOrderDto: CreateOrderDto): Promise<Order> {
    const order = this.orderRepository.create({
      ...createOrderDto,
      userId,
      status: OrderStatus.PENDING,
      filledQuantity: 0,
    });

    const savedOrder = await this.orderRepository.save(order);
    
    // Process order through matching engine
    const { trades, updatedOrder } = await this.matchingEngine.processOrder(savedOrder);
    
    return updatedOrder;
  }

  async getOrder(id: string, userId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id, userId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateOrder(id: string, userId: string, updateOrderDto: UpdateOrderDto): Promise<Order> {
    const order = await this.getOrder(id, userId);
    
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Cannot update non-pending order');
    }

    Object.assign(order, updateOrderDto);
    return this.orderRepository.save(order);
  }

  async cancelOrder(id: string, userId: string): Promise<Order> {
    const order = await this.getOrder(id, userId);
    
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Cannot cancel non-pending order');
    }

    await this.matchingEngine.cancelOrder(id);
    
    order.status = OrderStatus.CANCELLED;
    return this.orderRepository.save(order);
  }

  async getUserOrders(userId: string, filters: any): Promise<{ orders: Order[]; total: number }> {
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .where('order.userId = :userId', { userId });

    if (filters.status) {
      queryBuilder.andWhere('order.status = :status', { status: filters.status });
    }

    if (filters.bondId) {
      queryBuilder.andWhere('order.bondId = :bondId', { bondId: filters.bondId });
    }

    const total = await queryBuilder.getCount();
    const orders = await queryBuilder
      .orderBy('order.createdAt', 'DESC')
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getMany();

    return { orders, total };
  }

  async getOrderBook(bondId: string) {
    return this.matchingEngine.getOrderBook(bondId);
  }
}
