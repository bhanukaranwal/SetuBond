import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ClientKafka } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';

import { Order, OrderSide, OrderStatus, OrderType } from '../entities/order.entity';
import { Trade } from '../entities/trade.entity';

interface OrderBookEntry {
  id: string;
  price: number;
  quantity: number;
  remainingQuantity: number;
  timestamp: Date;
}

@Injectable()
export class MatchingEngineService {
  private readonly logger = new Logger(MatchingEngineService.name);
  private orderBooks: Map<string, {
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
  }> = new Map();

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Trade)
    private tradeRepository: Repository<Trade>,
    private dataSource: DataSource,
    @Inject('KAFKA_SERVICE') private kafkaClient: ClientKafka,
  ) {
    this.initializeOrderBooks();
  }

  private async initializeOrderBooks() {
    // Load active orders from database on startup
    const activeOrders = await this.orderRepository.find({
      where: { status: OrderStatus.PENDING },
      order: { createdAt: 'ASC' },
    });

    for (const order of activeOrders) {
      this.addToOrderBook(order);
    }

    this.logger.log(`Initialized order books with ${activeOrders.length} active orders`);
  }

  async processOrder(order: Order): Promise<{ trades: Trade[]; updatedOrder: Order }> {
    const trades: Trade[] = [];

    if (order.orderType === OrderType.MARKET) {
      return this.processMarketOrder(order);
    } else if (order.orderType === OrderType.LIMIT) {
      return this.processLimitOrder(order);
    }

    return { trades, updatedOrder: order };
  }

  private async processMarketOrder(order: Order): Promise<{ trades: Trade[]; updatedOrder: Order }> {
    const trades: Trade[] = [];
    const orderBook = this.getOrCreateOrderBook(order.bondId);
    const oppositeBook = order.side === OrderSide.BUY ? orderBook.asks : orderBook.bids;

    let remainingQuantity = parseFloat(order.quantity.toString());

    // Sort by price (best prices first)
    oppositeBook.sort((a, b) => {
      if (order.side === OrderSide.BUY) {
        return a.price - b.price; // Buy against lowest ask prices
      } else {
        return b.price - a.price; // Sell against highest bid prices
      }
    });

    await this.dataSource.transaction(async (manager) => {
      for (const bookEntry of oppositeBook) {
        if (remainingQuantity <= 0) break;

        const matchQuantity = Math.min(remainingQuantity, bookEntry.remainingQuantity);
        
        // Create trade
        const trade = manager.create(Trade, {
          bondId: order.bondId,
          buyOrderId: order.side === OrderSide.BUY ? order.id : bookEntry.id,
          sellOrderId: order.side === OrderSide.SELL ? order.id : bookEntry.id,
          buyUserId: order.side === OrderSide.BUY ? order.userId : await this.getUserIdByOrderId(bookEntry.id),
          sellUserId: order.side === OrderSide.SELL ? order.userId : await this.getUserIdByOrderId(bookEntry.id),
          quantity: matchQuantity,
          price: bookEntry.price,
          totalValue: matchQuantity * bookEntry.price,
          executedAt: new Date(),
        });

        const savedTrade = await manager.save(Trade, trade);
        trades.push(savedTrade);

        // Update quantities
        remainingQuantity -= matchQuantity;
        bookEntry.remainingQuantity -= matchQuantity;
        order.filledQuantity = parseFloat(order.filledQuantity.toString()) + matchQuantity;

        // Update opposite order
        const oppositeOrder = await manager.findOne(Order, { where: { id: bookEntry.id } });
        if (oppositeOrder) {
          oppositeOrder.filledQuantity = parseFloat(oppositeOrder.filledQuantity.toString()) + matchQuantity;
          if (bookEntry.remainingQuantity <= 0) {
            oppositeOrder.status = OrderStatus.FILLED;
          }
          await manager.save(Order, oppositeOrder);
        }

        // Remove from order book if fully filled
        if (bookEntry.remainingQuantity <= 0) {
          const index = oppositeBook.indexOf(bookEntry);
          oppositeBook.splice(index, 1);
        }
      }

      // Update order status
      if (remainingQuantity <= 0) {
        order.status = OrderStatus.FILLED;
      } else if (order.filledQuantity > 0) {
        order.status = OrderStatus.PARTIALLY_FILLED;
      } else {
        order.status = OrderStatus.REJECTED; // No liquidity
      }

      // Calculate average price
      if (trades.length > 0) {
        const totalValue = trades.reduce((sum, trade) => sum + parseFloat(trade.totalValue.toString()), 0);
        const totalQuantity = trades.reduce((sum, trade) => sum + parseFloat(trade.quantity.toString()), 0);
        order.averagePrice = totalValue / totalQuantity;
      }

      await manager.save(Order, order);
    });

    // Emit events
    this.emitTradeEvents(trades);
    this.emitOrderBookUpdate(order.bondId);

    return { trades, updatedOrder: order };
  }

  private async processLimitOrder(order: Order): Promise<{ trades: Trade[]; updatedOrder: Order }> {
    const trades: Trade[] = [];
    const orderBook = this.getOrCreateOrderBook(order.bondId);
    const oppositeBook = order.side === OrderSide.BUY ? orderBook.asks : orderBook.bids;

    let remainingQuantity = parseFloat(order.quantity.toString());

    // Check for immediate matches
    const matchableOrders = oppositeBook.filter(entry => {
      if (order.side === OrderSide.BUY) {
        return entry.price <= parseFloat(order.price.toString());
      } else {
        return entry.price >= parseFloat(order.price.toString());
      }
    });

    // Sort for best execution
    matchableOrders.sort((a, b) => {
      if (order.side === OrderSide.BUY) {
        return a.price - b.price;
      } else {
        return b.price - a.price;
      }
    });

    await this.dataSource.transaction(async (manager) => {
      // Execute immediate matches
      for (const bookEntry of matchableOrders) {
        if (remainingQuantity <= 0) break;

        const matchQuantity = Math.min(remainingQuantity, bookEntry.remainingQuantity);
        
        const trade = manager.create(Trade, {
          bondId: order.bondId,
          buyOrderId: order.side === OrderSide.BUY ? order.id : bookEntry.id,
          sellOrderId: order.side === OrderSide.SELL ? order.id : bookEntry.id,
          buyUserId: order.side === OrderSide.BUY ? order.userId : await this.getUserIdByOrderId(bookEntry.id),
          sellUserId: order.side === OrderSide.SELL ? order.userId : await this.getUserIdByOrderId(bookEntry.id),
          quantity: matchQuantity,
          price: bookEntry.price, // Take the existing order's price
          totalValue: matchQuantity * bookEntry.price,
          executedAt: new Date(),
        });

        const savedTrade = await manager.save(Trade, trade);
        trades.push(savedTrade);

        remainingQuantity -= matchQuantity;
        bookEntry.remainingQuantity -= matchQuantity;
        order.filledQuantity = parseFloat(order.filledQuantity.toString()) + matchQuantity;

        // Update opposite order
        const oppositeOrder = await manager.findOne(Order, { where: { id: bookEntry.id } });
        if (oppositeOrder) {
          oppositeOrder.filledQuantity = parseFloat(oppositeOrder.filledQuantity.toString()) + matchQuantity;
          if (bookEntry.remainingQuantity <= 0) {
            oppositeOrder.status = OrderStatus.FILLED;
          }
          await manager.save(Order, oppositeOrder);
        }

        if (bookEntry.remainingQuantity <= 0) {
          const index = oppositeBook.indexOf(bookEntry);
          oppositeBook.splice(index, 1);
        }
      }

      // Update order status and add to book if not fully filled
      if (remainingQuantity <= 0) {
        order.status = OrderStatus.FILLED;
      } else {
        if (order.filledQuantity > 0) {
          order.status = OrderStatus.PARTIALLY_FILLED;
        }
        // Add remaining quantity to order book
        this.addToOrderBook(order, remainingQuantity);
      }

      if (trades.length > 0) {
        const totalValue = trades.reduce((sum, trade) => sum + parseFloat(trade.totalValue.toString()), 0);
        const totalQuantity = trades.reduce((sum, trade) => sum + parseFloat(trade.quantity.toString()), 0);
        order.averagePrice = totalValue / totalQuantity;
      }

      await manager.save(Order, order);
    });

    this.emitTradeEvents(trades);
    this.emitOrderBookUpdate(order.bondId);

    return { trades, updatedOrder: order };
  }

  private getOrCreateOrderBook(bondId: string) {
    if (!this.orderBooks.has(bondId)) {
      this.orderBooks.set(bondId, {
        bids: [],
        asks: [],
      });
    }
    return this.orderBooks.get(bondId);
  }

  private addToOrderBook(order: Order, remainingQuantity?: number) {
    const orderBook = this.getOrCreateOrderBook(order.bondId);
    const bookEntry: OrderBookEntry = {
      id: order.id,
      price: parseFloat(order.price.toString()),
      quantity: parseFloat(order.quantity.toString()),
      remainingQuantity: remainingQuantity || parseFloat(order.quantity.toString()) - parseFloat(order.filledQuantity.toString()),
      timestamp: order.createdAt,
    };

    if (order.side === OrderSide.BUY) {
      orderBook.bids.push(bookEntry);
      orderBook.bids.sort((a, b) => b.price - a.price); // Highest bid first
    } else {
      orderBook.asks.push(bookEntry);
      orderBook.asks.sort((a, b) => a.price - b.price); // Lowest ask first
    }
  }

  getOrderBook(bondId: string) {
    return this.orderBooks.get(bondId) || { bids: [], asks: [] };
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) return;

    // Remove from order book
    const orderBook = this.getOrCreateOrderBook(order.bondId);
    const book = order.side === OrderSide.BUY ? orderBook.bids : orderBook.asks;
    const index = book.findIndex(entry => entry.id === orderId);
    if (index >= 0) {
      book.splice(index, 1);
    }

    // Update order status
    order.status = OrderStatus.CANCELLED;
    await this.orderRepository.save(order);

    this.emitOrderBookUpdate(order.bondId);
  }

  private async getUserIdByOrderId(orderId: string): Promise<string> {
    const order = await this.orderRepository.findOne({ 
      where: { id: orderId },
      select: ['userId'] 
    });
    return order?.userId || '';
  }

  private emitTradeEvents(trades: Trade[]) {
    for (const trade of trades) {
      this.kafkaClient.emit('trade.executed', {
        tradeId: trade.id,
        bondId: trade.bondId,
        quantity: trade.quantity,
        price: trade.price,
        timestamp: trade.executedAt,
      });
    }
  }

  private emitOrderBookUpdate(bondId: string) {
    const orderBook = this.getOrderBook(bondId);
    this.kafkaClient.emit('orderbook.updated', {
      bondId,
      bids: orderBook.bids.slice(0, 10), // Top 10 bids
      asks: orderBook.asks.slice(0, 10), // Top 10 asks
      timestamp: new Date(),
    });
  }
}
