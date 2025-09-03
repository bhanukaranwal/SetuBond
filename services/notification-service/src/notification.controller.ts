import { Controller } from '@nestjs/common';
import { GrpcMethod, MessagePattern } from '@nestjs/microservices';
import { NotificationService } from './notification.service';

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @GrpcMethod('NotificationService', 'SendNotification')
  async sendNotification(data: any) {
    return this.notificationService.sendNotification(data);
  }

  @GrpcMethod('NotificationService', 'SendEmail')
  async sendEmail(data: any) {
    return this.notificationService.sendEmail(data);
  }

  @GrpcMethod('NotificationService', 'SendSMS')
  async sendSMS(data: any) {
    return this.notificationService.sendSMS(data);
  }

  @MessagePattern('order.created')
  async handleOrderCreated(data: any) {
    await this.notificationService.handleOrderCreated(data);
  }

  @MessagePattern('trade.executed')
  async handleTradeExecuted(data: any) {
    await this.notificationService.handleTradeExecuted(data);
  }

  @MessagePattern('price.alert')
  async handlePriceAlert(data: any) {
    await this.notificationService.handlePriceAlert(data);
  }
}
