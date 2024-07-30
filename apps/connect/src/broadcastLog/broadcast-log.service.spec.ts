import { Test, TestingModule } from '@nestjs/testing';
import { BroadcastLogService } from './broadcast-log.service';

describe('BroadcastLogService', () => {
  let service: BroadcastLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BroadcastLogService],
    }).compile();

    service = module.get<BroadcastLogService>(BroadcastLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
