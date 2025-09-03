import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('market_data')
@Index(['isin', 'timestamp'])
@Index(['exchange', 'timestamp'])
export class MarketData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  isin: string;

  @Column()
  symbol: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  price: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  bidPrice?: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  askPrice?: number;

  @Column({ type: 'bigint' })
  volume: number;

  @Column({ type: 'decimal', precision: 8, scale: 6, nullable: true })
  yield?: number;

  @Column({ type: 'decimal', precision: 8, scale: 6, nullable: true })
  ytm?: number;

  @Column()
  exchange: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  marketCap?: number;

  @Column({ type: 'jsonb', nullable: true })
  additionalData?: Record<string, any>;

  @Column({ type: 'timestamp with time zone' })
  @Index()
  timestamp: Date;

  @CreateDateColumn()
  createdAt: Date;
}
