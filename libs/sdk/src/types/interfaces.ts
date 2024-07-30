import { ModuleMetadata, Provider } from '@nestjs/common';
import { Message } from './broadcast.type';

export interface IService {
  send(address: string, message: Message): Promise<void>;
}

export interface AsyncOptions<T> extends Pick<ModuleMetadata, 'imports'> {
  inject?: any[];
  useFactory: (...args: any[]) => Promise<T> | T;
  extraProviders?: Provider[];
}
