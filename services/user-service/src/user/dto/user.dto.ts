import { IsEmail, IsString, IsEnum, IsOptional, IsPhoneNumber, MinLength } from 'class-validator';
import { UserRole, InvestorType, RiskProfile } from '../entities/user.entity';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsPhoneNumber('IN')
  phone?: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsOptional()
  @IsEnum(InvestorType)
  investorType?: InvestorType;

  @IsOptional()
  @IsEnum(RiskProfile)
  riskProfile?: RiskProfile;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsPhoneNumber('IN')
  phone?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
