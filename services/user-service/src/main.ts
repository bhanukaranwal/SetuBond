import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'user',
      protoPath: join(__dirname, '../../../shared/proto/user.proto'),
      url: 'localhost:50051',
    },
  });

  await app.listen();
  console.log('🔐 User Service is listening on port 50051');
}

bootstrap();
