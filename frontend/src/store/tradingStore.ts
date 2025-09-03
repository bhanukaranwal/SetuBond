import { create } from 'zustand';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

interface OrderBookEntry {
  price: number;
  quantity: number;
  orders: number;
}

interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  lastUpdate: string;
}

interface Order {
  id: string;
  bondId: string;
  orderType: string;
  side: string;
  quantity: number;
  price?: number;
  filledQuantity: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Trade {
  id: string;
  bondId: string;
  quantity: number;
  price: number;
  totalValue: number;
  executedAt: string;
}

interface TradingState {
  orderBooks: Map<string, OrderBook>;
  userOrders: Order[];
  recentTrades: Trade[];
  selectedBond: string | null;
  socket: Socket | null;
  isConnected: boolean;
  
  // Actions
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  subscribeToOrderBook: (bondId: string) => void;
  unsubscribeFromOrderBook: (bondId: string) => void;
  createOrder: (orderData: any) => Promise<Order>;
  cancelOrder: (orderId: string) => Promise<void>;
  fetchUserOrders: () => Promise<void>;
  fetchOrderBook: (bondId: string) => Promise<void>;
  setSelectedBond: (bondId: string) => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

export const useTradingStore = create<TradingState>((set, get) => ({
  orderBooks: new Map(),
  userOrders: [],
  recentTrades: [],
  selectedBond: null,
  socket: null,
  isConnected: false,

  connectWebSocket: () => {
    const socket = io(WS_URL, {
      transports: ['websocket'],
      upgrade: false,
    });

    socket.on('connect', () => {
      set({ isConnected: true });
      console.log('Connected to WebSocket');
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
      console.log('Disconnected from WebSocket');
    });

    socket.on('orderbook.updated', (data: { bondId: string; bids: any[]; asks: any[] }) => {
      const { orderBooks } = get();
      const newOrderBooks = new Map(orderBooks);
      
      newOrderBooks.set(data.bondId, {
        bids: data.bids.map((bid: any) => ({
          price: bid.price,
          quantity: bid.remainingQuantity,
          orders: 1,
        })),
        asks: data.asks.map((ask: any) => ({
          price: ask.price,
          quantity: ask.remainingQuantity,
          orders: 1,
        })),
        lastUpdate: new Date().toISOString(),
      });

      set({ orderBooks: newOrderBooks });
    });

    socket.on('trade.executed', (trade: Trade) => {
      set((state) => ({
        recentTrades: [trade, ...state.recentTrades.slice(0, 99)], // Keep last 100 trades
      }));
    });

    socket.on('order.updated', (order: Order) => {
      set((state) => ({
        userOrders: state.userOrders.map((o) => 
          o.id === order.id ? order : o
        ),
      }));
    });

    set({ socket });
  },

  disconnectWebSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  subscribeToOrderBook: (bondId: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('subscribe', { type: 'orderbook', bondId });
    }
  },

  unsubscribeFromOrderBook: (bondId: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('unsubscribe', { type: 'orderbook', bondId });
    }
  },

  createOrder: async (orderData: any) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/v1/trading/orders`, orderData);
      const newOrder = response.data;

      set((state) => ({
        userOrders: [newOrder, ...state.userOrders],
      }));

      return newOrder;
    } catch (error) {
      throw error;
    }
  },

  cancelOrder: async (orderId: string) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/v1/trading/orders/${orderId}`);
      
      set((state) => ({
        userOrders: state.userOrders.map((order) =>
          order.id === orderId ? { ...order, status: 'CANCELLED' } : order
        ),
      }));
    } catch (error) {
      throw error;
    }
  },

  fetchUserOrders: async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/v1/trading/orders`);
      set({ userOrders: response.data });
    } catch (error) {
      console.error('Failed to fetch user orders:', error);
    }
  },

  fetchOrderBook: async (bondId: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/v1/trading/orderbook/${bondId}`);
      const orderBookData = response.data;

      const { orderBooks } = get();
      const newOrderBooks = new Map(orderBooks);
      newOrderBooks.set(bondId, {
        ...orderBookData,
        lastUpdate: new Date().toISOString(),
      });

      set({ orderBooks: newOrderBooks });
    } catch (error) {
      console.error('Failed to fetch order book:', error);
    }
  },

  setSelectedBond: (bondId: string) => {
    const { selectedBond, unsubscribeFromOrderBook, subscribeToOrderBook } = get();
    
    if (selectedBond) {
      unsubscribeFromOrderBook(selectedBond);
    }
    
    set({ selectedBond: bondId });
    subscribeToOrderBook(bondId);
  },
}));
