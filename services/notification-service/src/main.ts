import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'notification',
      protoPath: join(__dirname, '../../../shared/proto/notification.proto'),
      url: 'localhost:50056',
    },
  });

  // Also create HTTP app for WebSocket server
  const httpApp = await NestFactory.create(AppModule);
  await httpApp.listen(3006);

  await app.listen();
  console.log('🔔 Notification Service is listening on gRPC port 50056 and HTTP port 3006');
}

bootstrap();
