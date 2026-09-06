import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { SequelizeModule } from '@nestjs/sequelize';
import { QueueModule, workerLabel } from '@rsconnect/queue';
import { AmqpModule, DataProviderModule } from '@rsconnect/workers';
import { EXCHANGES, QUEUES } from '@rumsan/connect';
import amqp, { Channel } from 'amqp-connection-manager';
import { mkdirSync } from 'fs';
import { AsteriskWorkerModule } from '../workers/asterisk.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Sequelize will not create the directory for the SQLite file.
const SCRATCH_DIR = `.data/${workerLabel()}`;
mkdirSync(SCRATCH_DIR, { recursive: true });

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DataProviderModule.forRootAsync('api'),
    SequelizeModule.forRoot({
      dialect: 'sqlite',
      // Scoped per worker so several instances can share a host without
      // fighting over one cache file.
      storage: `${SCRATCH_DIR}/asterisk-worker.db`,
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
          setup: async (channel: Channel) => {
            await channel.assertExchange(EXCHANGES.TRANSPORT, 'topic', {
              durable: true,
            });
            await channel.assertQueue(QUEUES.TRANSPORT_API, { durable: true });
            await channel.assertQueue(QUEUES.TRANSPORT_VOICE, {
              durable: true,
            });
            await channel.assertQueue(QUEUES.TO_CONNECT, { durable: true });
          },
        });
      },
    }),
    QueueModule,
    AsteriskWorkerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
