import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AsteriskWorkerModule } from '../workers/asterisk.module';
import { AmqpModule, DataProviderModule } from '@rsconnect/workers';
import amqp, { Channel } from 'amqp-connection-manager';
import { QUEUES } from '@rumsan/connect';
import { SequelizeModule } from '@nestjs/sequelize';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DataProviderModule.forRootAsync('api'),
    SequelizeModule.forRoot({
      dialect: 'sqlite',
      storage: '.data/asterisk-worker.db',
      logging: false,
      autoLoadModels: true,
      synchronize: true,
    }),
    AmqpModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const connection = amqp.connect(configService.get('AMQP_URL'));
        return connection.createChannel({
          setup: (channel: Channel) => {
            channel.assertQueue(QUEUES.TRANSPORT_API, { durable: true });
            channel.assertQueue(QUEUES.TRANSPORT_VOICE, { durable: true });
            channel.assertQueue(QUEUES.LOG_BROADCAST, { durable: true });
          },
        });
      },
    }),
    AsteriskWorkerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
