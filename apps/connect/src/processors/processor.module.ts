import { Module } from '@nestjs/common';

import { EmailProcessor } from './email.processor';
import { EchoProcessor } from './echo.processor';

@Module({
  imports: [],
  providers: [EmailProcessor, EchoProcessor],
})
export class ProcessorModule {}
