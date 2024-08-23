/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
import * as bodyParser from 'body-parser';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { RsExceptionFilter } from '@rumsan/extensions/exceptions';
import { ResponseTransformInterceptor } from '@rumsan/extensions/interceptors';
import { WinstonModule } from 'nest-winston';
import { AppModule } from './app/app.module';
import { loggerInstance } from './utils/winston.logger';

// import { GlobalExceptionFilter } from './utils/exceptions/rpcException.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, {
    logger: WinstonModule.createLogger({
      instance: loggerInstance,
    }),
  });
  const globalPrefix = 'v1';
  app.enableCors();

  // app.use(bodyParser.raw({ type: 'application/octet-stream' }));
  app.use(bodyParser.raw({ type: 'application/octet-stream', limit: '50mb' }));

  // increase limit of payload size
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  //must have this if you want to implicit conversion of string to number in dto
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new RsExceptionFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());
  app.setGlobalPrefix(globalPrefix);

  const port = process.env.PORT || 3333;

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Rahat Core')
      .setDescription('API service for Rumsan Communication')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('', app, document);
  }

  await app.startAllMicroservices();
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
