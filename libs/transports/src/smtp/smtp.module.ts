import { DynamicModule, Global, Module, ValueProvider } from '@nestjs/common';
import { SmtpService } from './smtp.service';
import { AsyncOptions, TransportSmtpConfig } from '@rumsan/connect/types';

@Global()
@Module({
  providers: [SmtpService],
  exports: [SmtpService],
})
export class SmtpModule {
  public static forRoot(options: TransportSmtpConfig): DynamicModule {
    const smtpProvider: ValueProvider<TransportSmtpConfig> = {
      provide: 'SMTP_CONFIG',
      useValue: options,
    };

    return {
      module: SmtpModule,
      providers: [smtpProvider],
      exports: [smtpProvider],
    };
  }

  static forRootAsync(
    options: AsyncOptions<TransportSmtpConfig>
  ): DynamicModule {
    const smtpProvider = {
      provide: 'SMTP_CONFIG',
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: SmtpModule,
      providers: [smtpProvider],
      exports: [smtpProvider],
    };
  }
}
