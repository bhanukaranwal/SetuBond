import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsEnum, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP_LOSS = 'STOP_LOSS',
  ICEBERG = 'ICEBERG',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum TimeInForce {
  GTC = 'GTC', // Good Till Cancelled
  IOC = 'IOC', // Immediate or Cancel
  FOK = 'FOK', // Fill or Kill
}

export class CreateOrderDto {
  @ApiProperty({ description: 'Bond ISIN' })
  @IsString()
  bondId: string;

  @ApiProperty({ enum: OrderType })
  @IsEnum(OrderType)
  orderType: OrderType;

  @ApiProperty({ enum: OrderSide })
  @IsEnum(OrderSide)
  side: OrderSide;

  @ApiProperty({ description: 'Order quantity' })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Price per unit', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiProperty({ description: 'Stop price for stop-loss orders', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stopPrice?: number;

  @ApiProperty({ enum: TimeInForce, default: TimeInForce.GTC })
  @IsOptional()
  @IsEnum(TimeInForce)
  timeInForce?: TimeInForce;

  @ApiProperty({ description: 'Hidden quantity for iceberg orders', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  hiddenQuantity?: number;

  @ApiProperty({ description: 'Order notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrderDto {
  @ApiProperty({ description: 'Updated quantity', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @ApiProperty({ description: 'Updated price', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiProperty({ description: 'Updated stop price', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stopPrice?: number;
}

export class TradeRequestDto {
  @ApiProperty({ description: 'Bond ISIN' })
  @IsString()
  bondId: string;

  @ApiProperty({ enum: OrderSide })
  @IsEnum(OrderSide)
  side: OrderSide;

  @ApiProperty({ description: 'Desired quantity' })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Minimum acceptable price', required: false })
  @IsOptional()
  @IsNumber()
  minPrice?: number;

  @ApiProperty({ description: 'Maximum acceptable price', required: false })
  @IsOptional()
  @IsNumber()
  maxPrice?: number;

  @ApiProperty({ description: 'RFQ expiry time in minutes', default: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1440)
  expiryMinutes?: number;

  @ApiProperty({ description: 'Additional requirements' })
  @IsOptional()
  @IsString()
  requirements?: string;
}
