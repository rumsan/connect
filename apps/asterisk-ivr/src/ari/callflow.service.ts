import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';

@Injectable()
export class CallFlowService {
  private readonly logger = new Logger(CallFlowService.name);

  async loadJson() {
    const data = fs.readFileSync('callflow.json');
    return JSON.parse(data.toString());
  }
}
