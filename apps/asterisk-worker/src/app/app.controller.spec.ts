import { Test, TestingModule } from '@nestjs/testing';

import { AsteriskWorker } from '../workers/asterisk.worker';
import { AppController } from './app.controller';
import { AppService } from './app.service';

const workerStatus = {
  workerId: 'voice-1',
  priority: 1,
  capacity: 10,
  queue: 'rsconnect.transport.voice.voice-1',
  activeSession: null,
  pendingSessions: 0,
  inFlight: 0,
};

describe('AppController', () => {
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: AsteriskWorker, useValue: { status: workerStatus } },
      ],
    }).compile();
  });

  describe('getData', () => {
    it('should return "Hello API"', () => {
      const appController = app.get<AppController>(AppController);
      expect(appController.getData()).toEqual({ message: 'Hello API' });
    });
  });

  describe('health', () => {
    it('reports this instance identity and load', () => {
      const appController = app.get<AppController>(AppController);
      expect(appController.health()).toEqual({
        status: 'ok',
        ...workerStatus,
      });
    });
  });
});
