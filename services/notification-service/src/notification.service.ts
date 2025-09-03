import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as nodemailer from 'nodemailer';
import { Twilio } from 'twilio';
import * as admin from 'firebase-admin';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'notifications'
})
export class NotificationService implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationService.name);
  private emailTransporter: nodemailer.Transporter;
  private twilioClient: Twilio;
  private connectedUsers = new Map<string, Socket>();

  constructor() {
    this.initializeServices();
  }

  private initializeServices() {
    // Email transporter
    this.emailTransporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Twilio SMS
    this.twilioClient = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    // Firebase for push notifications
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  }

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      this.connectedUsers.set(userId, client);
      this.logger.log(`User ${userId} connected`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = Array.from(this.connectedUsers.entries())
      .find(([, socket]) => socket.id === client.id)?.[0];
    
    if (userId) {
      this.connectedUsers.delete(userId);
      this.logger.log(`User ${userId} disconnected`);
    }
  }

  async sendNotification(data: any) {
    try {
      const { userId, type, message, metadata } = data;

      // Send real-time notification via WebSocket
      const userSocket = this.connectedUsers.get(userId);
      if (userSocket) {
        userSocket.emit('notification', {
          type,
          message,
          timestamp: new Date().toISOString(),
          metadata,
        });
      }

      // Send push notification if user is offline
      if (!userSocket && metadata.pushToken) {
        await this.sendPushNotification(metadata.pushToken, message);
      }

      return { success: true, delivered: !!userSocket };
    } catch (error) {
      this.logger.error('Notification sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  async sendEmail(data: any) {
    try {
      const { to, subject, html, attachments } = data;

      const mailOptions = {
        from: process.env.FROM_EMAIL || 'noreply@setubond.com',
        to,
        subject,
        html,
        attachments,
      };

      const result = await this.emailTransporter.sendMail(mailOptions);
      
      this.logger.log(`Email sent to ${to}: ${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      this.logger.error('Email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  async sendSMS(data: any) {
    try {
      const { to, message } = data;

      const result = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
      });

      this.logger.log(`SMS sent to ${to}: ${result.sid}`);
      return { success: true, messageSid: result.sid };
    } catch (error) {
      this.logger.error('SMS sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  async sendPushNotification(token: string, message: string) {
    try {
      const payload = {
        notification: {
          title: 'SetuBond',
          body: message,
        },
        token,
      };

      const result = await admin.messaging().send(payload);
      this.logger.log(`Push notification sent: ${result}`);
      return { success: true, result };
    } catch (error) {
      this.logger.error('Push notification failed:', error);
      return { success: false, error: error.message };
    }
  }

  async handleOrderCreated(data: any) {
    const message = `Your ${data.side} order for ${data.bondId} has been created`;
    
    await this.sendNotification({
      userId: data.userId,
      type: 'ORDER_CREATED',
      message,
      metadata: { orderId: data.orderId },
    });
  }

  async handleTradeExecuted(data: any) {
    const buyerMessage = `Your buy order has been executed at ₹${data.price}`;
    const sellerMessage = `Your sell order has been executed at ₹${data.price}`;

    await Promise.all([
      this.sendNotification({
        userId: data.buyUserId,
        type: 'TRADE_EXECUTED',
        message: buyerMessage,
        metadata: { tradeId: data.tradeId },
      }),
      this.sendNotification({
        userId: data.sellUserId,
        type: 'TRADE_EXECUTED',
        message: sellerMessage,
        metadata: { tradeId: data.tradeId },
      }),
    ]);
  }

  async handlePriceAlert(data: any) {
    const message = `Price alert: ${data.bondId} is now at ₹${data.price}`;
    
    await this.sendNotification({
      userId: data.userId,
      type: 'PRICE_ALERT',
      message,
      metadata: { bondId: data.bondId, price: data.price },
    });
  }

  async broadcastMarketUpdate(data: any) {
    this.server.emit('market_update', {
      bondId: data.bondId,
      price: data.price,
      volume: data.volume,
      timestamp: new Date().toISOString(),
    });
  }

  async broadcastOrderBookUpdate(data: any) {
    this.server.emit('orderbook_update', {
      bondId: data.bondId,
      bids: data.bids,
      asks: data.asks,
      timestamp: new Date().toISOString(),
    });
  }
}
