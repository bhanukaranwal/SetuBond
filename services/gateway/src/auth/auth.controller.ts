import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { Observable } from 'rxjs';

interface UserService {
  loginUser(data: any): Observable<any>;
  createUser(data: any): Observable<any>;
  refreshToken(data: any): Observable<any>;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private userService: UserService;

  constructor(@Inject('USER_SERVICE') private client: ClientGrpc) {}

  onModuleInit() {
    this.userService = this.client.getService<UserService>('UserService');
  }

  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() loginDto: { email: string; password: string }) {
    return this.userService.loginUser(loginDto);
  }

  @Post('register')
  @ApiOperation({ summary: 'User registration' })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  async register(@Body() registerDto: any) {
    return this.userService.createUser(registerDto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  async refresh(@Body() refreshDto: { refreshToken: string }) {
    return this.userService.refreshToken(refreshDto);
  }
}
