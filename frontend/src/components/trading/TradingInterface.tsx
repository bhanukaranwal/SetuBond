'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTradingStore } from '@/store/tradingStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import toast from 'react-hot-toast';

const orderSchema = z.object({
  orderType: z.enum(['MARKET', 'LIMIT', 'STOP_LOSS']),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  price: z.number().optional(),
  stopPrice: z.number().optional(),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK']).default('GTC'),
  notes: z.string().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;

interface TradingInterfaceProps {
  bondId: string;
  bondName: string;
  currentPrice?: number;
}

export const TradingInterface: React.FC<TradingInterfaceProps> = ({
  bondId,
  bondName,
  currentPrice,
}) => {
  const { createOrder } = useTradingStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'BUY' | 'SELL'>('BUY');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      orderType: 'LIMIT',
      side: 'BUY',
      timeInForce: 'GTC',
      price: currentPrice,
    },
  });

  const orderType = watch('orderType');
  const quantity = watch('quantity');
  const price = watch('price');

  const estimatedTotal = quantity && price ? quantity * price : 0;

  const onSubmit = async (data: OrderFormData) => {
    setIsSubmitting(true);
    try {
      const orderData = {
        ...data,
        bondId,
        side: activeTab,
      };

      await createOrder(orderData);
      toast.success(`${activeTab} order created successfully`);
      reset();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create order');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillCurrentPrice = () => {
    if (currentPrice) {
      setValue('price', currentPrice);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">Place Order</h3>
        <p className="text-sm text-gray-600">{bondName}</p>
      </div>

      <div className="p-4">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'BUY' | 'SELL')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="BUY" className="text-green-600 data-[state=active]:bg-green-50">
              Buy
            </TabsTrigger>
            <TabsTrigger value="SELL" className="text-red-600 data-[state=active]:bg-red-50">
              Sell
            </TabsTrigger>
          </TabsList>

          <TabsContent value="BUY" className="mt-4">
            <OrderForm
              side="BUY"
              onSubmit={onSubmit}
              register={register}
              handleSubmit={handleSubmit}
              watch={watch}
              setValue={setValue}
              errors={errors}
              isSubmitting={isSubmitting}
              orderType={orderType}
              estimatedTotal={estimatedTotal}
              currentPrice={currentPrice}
              fillCurrentPrice={fillCurrentPrice}
            />
          </TabsContent>

          <TabsContent value="SELL" className="mt-4">
            <OrderForm
              side="SELL"
              onSubmit={onSubmit}
              register={register}
              handleSubmit={handleSubmit}
              watch={watch}
              setValue={setValue}
              errors={errors}
              isSubmitting={isSubmitting}
              orderType={orderType}
              estimatedTotal={estimatedTotal}
              currentPrice={currentPrice}
              fillCurrentPrice={fillCurrentPrice}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const OrderForm: React.FC<{
  side: 'BUY' | 'SELL';
  onSubmit: (data: OrderFormData) => void;
  register: any;
  handleSubmit: any;
  watch: any;
  setValue: any;
  errors: any;
  isSubmitting: boolean;
  orderType: string;
  estimatedTotal: number;
  currentPrice?: number;
  fillCurrentPrice: () => void;
}> = ({
  side,
  onSubmit,
  register,
  handleSubmit,
  watch,
  setValue,
  errors,
  isSubmitting,
  orderType,
  estimatedTotal,
  currentPrice,
  fillCurrentPrice,
}) => {
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Order Type
        </label>
        <Select {...register('orderType')}>
          <option value="MARKET">Market Order</option>
          <option value="LIMIT">Limit Order</option>
          <option value="STOP_LOSS">Stop Loss</option>
        </Select>
        {errors.orderType && (
          <p className="text-red-500 text-xs mt-1">{errors.orderType.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Quantity
        </label>
        <Input
          type="number"
          step="1"
          min="1"
          {...register('quantity', { valueAsNumber: true })}
          placeholder="Enter quantity"
        />
        {errors.quantity && (
          <p className="text-red-500 text-xs mt-1">{errors.quantity.message}</p>
        )}
      </div>

      {orderType !== 'MARKET' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">
              Price
            </label>
            {currentPrice && (
              <button
                type="button"
                onClick={fillCurrentPrice}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Use current price (₹{currentPrice})
              </button>
            )}
          </div>
          <Input
            type="number"
            step="0.01"
            min="0"
            {...register('price', { valueAsNumber: true })}
            placeholder="Enter price"
          />
          {errors.price && (
            <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>
          )}
        </div>
      )}

      {orderType === 'STOP_LOSS' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Stop Price
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            {...register('stopPrice', { valueAsNumber: true })}
            placeholder="Enter stop price"
          />
          {errors.stopPrice && (
            <p className="text-red-500 text-xs mt-1">{errors.stopPrice.message}</p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Time in Force
        </label>
        <Select {...register('timeInForce')}>
          <option value="GTC">Good Till Cancelled</option>
          <option value="IOC">Immediate or Cancel</option>
          <option value="FOK">Fill or Kill</option>
        </Select>
        {errors.timeInForce && (
          <p className="text-red-500 text-xs mt-1">{errors.timeInForce.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes (Optional)
        </label>
        <Input
          {...register('notes')}
          placeholder="Add notes to your order"
        />
      </div>

      {estimatedTotal > 0 && (
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex justify-between text-sm">
            <span>Estimated Total:</span>
            <span className="font-semibold">₹{estimatedTotal.toLocaleString()}</span>
          </div>
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className={`w-full ${
          side === 'BUY' 
            ? 'bg-green-600 hover:bg-green-700' 
            : 'bg-red-600 hover:bg-red-700'
        }`}
      >
        {isSubmitting ? 'Placing Order...' : `Place ${side} Order`}
      </Button>
    </form>
  );
};
