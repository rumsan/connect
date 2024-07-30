import { DynamicModule, Global, Module, ValueProvider } from '@nestjs/common';
import { ApiService } from './api.service';
import { AsyncOptions, TransportApiConfig } from '@rsconnect/sdk/types';

@Global()
@Module({
  providers: [ApiService],
  exports: [ApiService],
})
export class ApiModule {
  public static forRoot(options: TransportApiConfig): DynamicModule {
    const apiProvider: ValueProvider<TransportApiConfig> = {
      provide: 'API_CONFIG',
      useValue: options,
    };

    return {
      module: ApiModule,
      providers: [apiProvider],
      exports: [apiProvider],
    };
  }

  static forRootAsync(
    options: AsyncOptions<TransportApiConfig>
  ): DynamicModule {
    const apiProvider = {
      provide: 'API_CONFIG',
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: ApiModule,
      providers: [apiProvider],
      exports: [apiProvider],
    };
  }
}
