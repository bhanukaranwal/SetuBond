import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { KycModule } from './kyc/kyc.module';
import { User } from './user/entities/user.entity';
import { UserProfile } from './user/entities/user-profile.entity';
import { KycDocument } from './kyc/entities/kyc-document.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    
    // PostgreSQL for structured data
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT) || 5432,
      username: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      database: process.env.POSTGRES_DB || 'setubond',
      entities: [User, UserProfile, KycDocument],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    }),

    // MongoDB for unstructured data
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/setubond'
    ),

    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),

    PassportModule,
    UserModule,
    AuthModule,
    KycModule,
  ],
})
export class AppModule {}
