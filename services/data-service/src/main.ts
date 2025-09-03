import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'data',
      protoPath: join(__dirname, '../../../shared/proto/data.proto'),
      url: 'localhost:50053',
    },
  });

  await app.listen();
  console.log('📊 Data Service is listening on port 50053');
}

bootstrap();
