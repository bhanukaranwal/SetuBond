import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, OneToMany } from 'typeorm';
import { UserProfile } from './user-profile.entity';
import { KycDocument } from '../../kyc/entities/kyc-document.entity';

export enum UserRole {
  RETAIL_INVESTOR = 'RETAIL_INVESTOR',
  HNI = 'HNI',
  INSTITUTIONAL_TRADER = 'INSTITUTIONAL_TRADER',
  ISSUER = 'ISSUER',
  MARKET_MAKER = 'MARKET_MAKER',
  ADMIN = 'ADMIN',
  REGULATOR = 'REGULATOR',
}

export enum UserStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BLOCKED = 'BLOCKED',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true, nullable: true })
  phone?: string;

  @Column()
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.RETAIL_INVESTOR,
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.PENDING_VERIFICATION,
  })
  status: UserStatus;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ default: false })
  phoneVerified: boolean;

  @Column({ default: false })
  kycCompleted: boolean;

  @Column({ nullable: true })
  googleId?: string;

  @Column({ nullable: true })
  linkedinId?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @Column({ type: 'inet', nullable: true })
  lastLoginIp?: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => UserProfile, profile => profile.user)
  profile: UserProfile;

  @OneToMany(() => KycDocument, document => document.user)
  kycDocuments: KycDocument[];
}
