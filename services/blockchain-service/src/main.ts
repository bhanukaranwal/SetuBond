import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'blockchain',
      protoPath: join(__dirname, '../../../shared/proto/blockchain.proto'),
      url: 'localhost:50055',
    },
  });

  await app.listen();
  console.log('🔗 Blockchain Service is listening on port 50055');
}

bootstrap();
