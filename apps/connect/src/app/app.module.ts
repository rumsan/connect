import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EmailProcessor } from '../processors/email.processor';
import { RsappModule } from '@rumsan/app';
import { PrismaModule } from '@rumsan/prisma';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { TransportModule } from '../transport/transport.module';
import { BullModule } from '@nestjs/bull';
import { EchoProcessor } from '../processors/echo.processor';
import { RabbitMQModule } from '../queues/queue.module';
import amqp from 'amqp-connection-manager';
import { QUEUES } from '@rsconnect/sdk';
import { Channel } from 'amqplib';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RsappModule,
    PrismaModule,
    BroadcastModule,
    TransportModule,
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const connection = amqp.connect(configService.get('AMQP_URL'));
        return connection.createChannel({
          setup: (channel: Channel) => {
            channel.assertQueue(QUEUES.TRANSPORT_API, { durable: true });
            channel.assertQueue(QUEUES.TRANSPORT_SMTP, { durable: true });
            channel.assertQueue(QUEUES.TRANSPORT_VOICE, { durable: true });
            channel.assertQueue(QUEUES.TRANSPORT_API, { durable: true });
            channel.assertQueue(QUEUES.LOG_TRANSPORT, { durable: true });
          },
        });
      },
    }),

    // SmtpModule.forRootAsync({
    //   imports: [ConfigModule],
    //   inject: [ConfigService],
    //   useFactory: (configService: ConfigService) => ({
    //     host: configService.get('SMTP_HOST'),
    //     port: +configService.get('SMTP_PORT'),
    //     secure: false,
    //     auth: {
    //       user: configService.get('SMTP_USER'),
    //       pass: configService.get('SMTP_PASS'),
    //     },
    //   }),
    // }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST'),
          port: +configService.get('REDIS_PORT'),
          password: configService.get('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          removeOnComplete: 20,
          removeOnFail: 200,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService, EmailProcessor, EchoProcessor],
})
export class AppModule {}
