import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'trading',
      protoPath: join(__dirname, '../../../shared/proto/trading.proto'),
      url: 'localhost:50052',
    },
  });

  await app.listen();
  console.log('📈 Trading Service is listening on port 50052');
}

bootstrap();
