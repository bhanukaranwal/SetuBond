import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

export enum InvestorType {
  INDIVIDUAL = 'INDIVIDUAL',
  HUF = 'HUF', // Hindu Undivided Family
  CORPORATE = 'CORPORATE',
  PARTNERSHIP = 'PARTNERSHIP',
  TRUST = 'TRUST',
  FPI = 'FPI', // Foreign Portfolio Investor
}

export enum RiskProfile {
  CONSERVATIVE = 'CONSERVATIVE',
  MODERATE = 'MODERATE',
  AGGRESSIVE = 'AGGRESSIVE',
}

@Entity('user_profiles')
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, user => user.profile)
  @JoinColumn()
  user: User;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  middleName?: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth?: Date;

  @Column({
    type: 'enum',
    enum: InvestorType,
    default: InvestorType.INDIVIDUAL,
  })
  investorType: InvestorType;

  @Column({ nullable: true })
  panNumber?: string;

  @Column({ nullable: true })
  aadhaarNumber?: string;

  @Column({ nullable: true })
  passportNumber?: string;

  @Column({ nullable: true })
  gstin?: string;

  @Column({ nullable: true })
  cin?: string; // Corporate Identification Number

  // Address Information
  @Column({ nullable: true })
  addressLine1?: string;

  @Column({ nullable: true })
  addressLine2?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  state?: string;

  @Column({ nullable: true })
  pincode?: string;

  @Column({ nullable: true })
  country?: string;

  // Financial Information
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  annualIncome?: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  netWorth?: number;

  @Column({
    type: 'enum',
    enum: RiskProfile,
    default: RiskProfile.MODERATE,
  })
  riskProfile: RiskProfile;

  @Column({ type: 'simple-array', nullable: true })
  investmentObjectives?: string[];

  @Column({ type: 'simple-array', nullable: true })
  investmentExperience?: string[];

  // Bank Account Information
  @Column({ nullable: true })
  bankAccountNumber?: string;

  @Column({ nullable: true })
  bankName?: string;

  @Column({ nullable: true })
  ifscCode?: string;

  @Column({ nullable: true })
  accountHolderName?: string;

  // Compliance Fields
  @Column({ default: false })
  isPoliticallyExposed: boolean;

  @Column({ nullable: true })
  pepDetails?: string;

  @Column({ type: 'simple-array', nullable: true })
  sanctionListChecks?: string[];

  @Column({ type: 'timestamp', nullable: true })
  lastAmlCheck?: Date;

  @Column({ type: 'jsonb', nullable: true })
  additionalData?: Record<string, any>;
}
