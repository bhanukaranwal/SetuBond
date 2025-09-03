import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'compliance',
      protoPath: join(__dirname, '../../../shared/proto/compliance.proto'),
      url: 'localhost:50057',
    },
  });

  await app.listen();
  console.log('🛡️ Compliance Service is listening on port 50057');
}

bootstrap();
