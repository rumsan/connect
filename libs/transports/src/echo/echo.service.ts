import { Inject, Injectable } from '@nestjs/common';
import { EchoOptions } from './echo.interface';
import { IService, Message } from '@rsconnect/sdk/types';

@Injectable()
export class EchoService implements IService {
  constructor(@Inject('ECHO_OPTIONS') private readonly options: EchoOptions) {}

  async send(address: string, message: Message): Promise<void> {
    console.log(this.options);
    console.log(address);
    console.log(message);
  }
}
