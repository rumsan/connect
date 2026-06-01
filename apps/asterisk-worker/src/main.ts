/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';

// swagger-client (used by ari-client) synchronously `throw`s a plain string
// from inside its HTTP callback when ARI is unreachable, escaping the Promise
// chain. Swallow it so IVRService's reconnect loop can keep running.
process.on('uncaughtException', (err) => {
  if (typeof err === 'string' || (err as { code?: string })?.code === 'HostIsNotReachable') {
    Logger.warn(`Swallowed ARI/swagger error, will reconnect: ${String(err)}`, 'Bootstrap');
    return;
  }
  Logger.error('Uncaught exception', err as Error, 'Bootstrap');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  Logger.warn(`Unhandled rejection: ${String(reason)}`, 'Bootstrap');
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`
  );
}

bootstrap();
