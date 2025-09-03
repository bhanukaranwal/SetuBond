'use client';

import React, { useEffect } from 'react';
import { useTradingStore } from '@/store/tradingStore';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface OrderBookProps {
  bondId: string;
}

export const OrderBook: React.FC<OrderBookProps> = ({ bondId }) => {
  const { orderBooks, fetchOrderBook, subscribeToOrderBook, unsubscribeFromOrderBook } = useTradingStore();
  const orderBook = orderBooks.get(bondId);

  useEffect(() => {
    fetchOrderBook(bondId);
    subscribeToOrderBook(bondId);

    return () => {
      unsubscribeFromOrderBook(bondId);
    };
  }, [bondId, fetchOrderBook, subscribeToOrderBook, unsubscribeFromOrderBook]);

  if (!orderBook) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold mb-4">Order Book</h3>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  const { bids, asks } = orderBook;
  const midPrice = bids.length > 0 && asks.length > 0 
    ? (bids[0].price + asks[0].price) / 2 
    : 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">Order Book</h3>
        {midPrice > 0 && (
          <p className="text-sm text-gray-600">
            Mid Price: {formatCurrency(midPrice)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x">
        {/* Bids */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="font-medium text-green-600">Bids</span>
          </div>
          
          <div className="space-y-1">
            <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-500 mb-2">
              <span>Price</span>
              <span className="text-right">Quantity</span>
              <span className="text-right">Orders</span>
            </div>
            
            {bids.slice(0, 10).map((bid, index) => (
              <div
                key={index}
                className="grid grid-cols-3 gap-2 text-sm py-1 hover:bg-green-50 rounded transition-colors"
              >
                <span className="font-medium text-green-600">
                  {formatCurrency(bid.price)}
                </span>
                <span className="text-right">
                  {formatNumber(bid.quantity)}
                </span>
                <span className="text-right text-gray-500">
                  {bid.orders}
                </span>
              </div>
            ))}
            
            {bids.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                No bids available
              </div>
            )}
          </div>
        </div>

        {/* Asks */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="font-medium text-red-600">Asks</span>
          </div>
          
          <div className="space-y-1">
            <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-500 mb-2">
              <span>Price</span>
              <span className="text-right">Quantity</span>
              <span className="text-right">Orders</span>
            </div>
            
            {asks.slice(0, 10).map((ask, index) => (
              <div
                key={index}
                className="grid grid-cols-3 gap-2 text-sm py-1 hover:bg-red-50 rounded transition-colors"
              >
                <span className="font-medium text-red-600">
                  {formatCurrency(ask.price)}
                </span>
                <span className="text-right">
                  {formatNumber(ask.quantity)}
                </span>
                <span className="text-right text-gray-500">
                  {ask.orders}
                </span>
              </div>
            ))}
            
            {asks.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                No asks available
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-t bg-gray-50">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Last Updated:</span>
          <span>{new Date(orderBook.lastUpdate).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};
