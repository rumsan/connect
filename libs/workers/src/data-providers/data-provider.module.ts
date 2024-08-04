import { DynamicModule, Global, Module } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { ApiProvider } from './api.provider';
import { PrismaProvider } from './prisma.provider';

@Global()
@Module({})
export class DataProviderModule {
  static forRootAsync(dataProviderType: 'api' | 'prisma'): DynamicModule {
    return {
      module: DataProviderModule,
      providers: [
        {
          provide: 'IDataProvider',
          useFactory: async (
            //configService: ConfigService,
            prismaService: PrismaService
          ) => {
            //const providerType = configService.get<string>('DATA_PROVIDER');
            if (dataProviderType === 'api') {
              return new ApiProvider();
            } else if (dataProviderType === 'prisma') {
              return new PrismaProvider(prismaService);
            } else {
              throw new Error('Unsupported DATA_PROVIDER value');
            }
          },
          inject: [
            //ConfigService,
            PrismaService,
          ],
        },
        PrismaService, // Provide PrismaService if not already provided
      ],
      exports: ['IDataProvider'],
    };
  }
}
