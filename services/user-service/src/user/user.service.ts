import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { User, UserStatus } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';
import { CreateUserDto, UpdateUserDto, LoginDto } from './dto/user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserProfile)
    private profileRepository: Repository<UserProfile>,
    private jwtService: JwtService,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const { email, phone, password, ...profileData } = createUserDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: [{ email }, { phone }],
    });

    if (existingUser) {
      throw new ConflictException('User with this email or phone already exists');
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = this.userRepository.create({
      email,
      phone,
      passwordHash,
      emailVerified: false,
      phoneVerified: false,
    });

    const savedUser = await this.userRepository.save(user);

    // Create user profile
    const profile = this.profileRepository.create({
      user: savedUser,
      ...profileData,
    });

    await this.profileRepository.save(profile);

    // Generate tokens
    const payload = { sub: savedUser.id, email: savedUser.email, role: savedUser.role };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    // Remove password hash from response
    delete savedUser.passwordHash;

    return {
      user: savedUser,
      accessToken,
      refreshToken,
    };
  }

  async login(loginDto: LoginDto): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const { email, password } = loginDto;

    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['profile'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.BLOCKED) {
      throw new BadRequestException('Account is suspended or blocked');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestException('Invalid credentials');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    // Generate tokens
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    // Remove password hash from response
    delete user.passwordHash;

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['profile', 'kycDocuments'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    delete user.passwordHash;
    return user;
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.getUserById(id);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
      user.emailVerified = false;
    }

    if (updateUserDto.phone && updateUserDto.phone !== user.phone) {
      const existingUser = await this.userRepository.findOne({
        where: { phone: updateUserDto.phone },
      });
      if (existingUser) {
        throw new ConflictException('Phone number already in use');
      }
      user.phoneVerified = false;
    }

    Object.assign(user, updateUserDto);
    const updatedUser = await this.userRepository.save(user);

    delete updatedUser.passwordHash;
    return updatedUser;
  }

  async verifyEmail(userId: string, token: string): Promise<void> {
    // In a real implementation, you would verify the token
    const user = await this.getUserById(userId);
    user.emailVerified = true;
    await this.userRepository.save(user);
  }

  async verifyPhone(userId: string, otp: string): Promise<void> {
    // In a real implementation, you would verify the OTP
    const user = await this.getUserById(userId);
    user.phoneVerified = true;
    await this.userRepository.save(user);
  }

  async updateUserStatus(userId: string, status: UserStatus): Promise<User> {
    const user = await this.getUserById(userId);
    user.status = status;
    const updatedUser = await this.userRepository.save(user);
    delete updatedUser.passwordHash;
    return updatedUser;
  }

  async searchUsers(query: string, limit: number = 20): Promise<User[]> {
    const users = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('user.email ILIKE :query', { query: `%${query}%` })
      .orWhere('profile.firstName ILIKE :query', { query: `%${query}%` })
      .orWhere('profile.lastName ILIKE :query', { query: `%${query}%` })
      .limit(limit)
      .getMany();

    return users.map(user => {
      delete user.passwordHash;
      return user;
    });
  }
}
