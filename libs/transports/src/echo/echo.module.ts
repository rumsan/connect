import { DynamicModule, Module, ValueProvider } from '@nestjs/common';
import { EchoService } from './echo.service';
import { EchoOptions } from './echo.interface';
import { AsyncOptions } from '@rumsan/connect/types';

@Module({
  providers: [EchoService],
})
export class EchoModule {
  public static forRoot(options: EchoOptions): DynamicModule {
    const OptionProvider: ValueProvider<EchoOptions> = {
      provide: 'ECHO_OPTIONS',
      useValue: options,
    };

    return {
      module: EchoModule,
      providers: [OptionProvider],
      exports: [OptionProvider],
    };
  }

  static forRootAsync(options: AsyncOptions<EchoOptions>): DynamicModule {
    const OptionProvider = {
      provide: 'ECHO_OPTIONS',
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: EchoModule,
      providers: [OptionProvider],
      exports: [OptionProvider],
    };
  }
}
