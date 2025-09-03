import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('trades')
@Index(['bondId', 'executedAt'])
@Index(['buyOrderId'])
@Index(['sellOrderId'])
export class Trade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  bondId: string;

  @Column({ type: 'uuid' })
  buyOrderId: string;

  @Column({ type: 'uuid' })
  sellOrderId: string;

  @Column({ type: 'uuid' })
  buyUserId: string;

  @Column({ type: 'uuid' })
  sellUserId: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  price: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  totalValue: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  buyerFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  sellerFee: number;

  @Column({ type: 'timestamp' })
  @Index()
  executedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
