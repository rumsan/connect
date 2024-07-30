import { Test, TestingModule } from '@nestjs/testing';
import { BroadcastLogController } from './broadcast-log.controller';
import { BroadcastLogService } from './broadcast-log.service';

describe('BroadcastLogController', () => {
  let controller: BroadcastLogController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BroadcastLogController],
      providers: [BroadcastLogService],
    }).compile();

    controller = module.get<BroadcastLogController>(BroadcastLogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
