import { ISessionGate } from './session-gate';
import { TransportPrepareError } from './transport-prepare.error';
import { TransportWorker } from './transport.worker';

/** Minimal worker whose preparation outcome each test decides. */
class TestWorker extends TransportWorker {
  queueTransport = 'rsconnect.transport.voice' as any;
  prepare: () => Promise<boolean> = async () => true;

  makeTransportReady() {
    return this.prepare();
  }
  async sendBroadcast(): Promise<any> {
    return undefined;
  }
  setGate(gate: ISessionGate) {
    this.sessionGate = gate;
  }
  ready(sessionCuid: string) {
    return this._makeTransportReady(sessionCuid);
  }
}

describe('TransportWorker readiness', () => {
  let transportQueue: {
    confirmReadiness: jest.Mock;
    reportReadinessFailure: jest.Mock;
  };
  let gate: { enqueue: jest.Mock; completeSession: jest.Mock };
  let worker: TestWorker;

  beforeEach(() => {
    transportQueue = {
      confirmReadiness: jest.fn().mockResolvedValue(true),
      reportReadinessFailure: jest.fn().mockResolvedValue(true),
    };
    gate = { enqueue: jest.fn(), completeSession: jest.fn() };
    worker = new TestWorker({} as any, {} as any, transportQueue as any);
    worker.setGate(gate);
  });

  it('confirms readiness when preparation succeeds', async () => {
    await worker.ready('s1');

    expect(transportQueue.confirmReadiness).toHaveBeenCalled();
    expect(transportQueue.reportReadinessFailure).not.toHaveBeenCalled();
    expect(gate.completeSession).not.toHaveBeenCalled();
  });

  it('reports READINESS_FAIL and releases the gate on a TransportPrepareError', async () => {
    worker.prepare = async () => {
      throw new TransportPrepareError('HTTP 400 Bad Request', 'AUDIO_UNAVAILABLE');
    };

    await worker.ready('s1');

    expect(transportQueue.reportReadinessFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionCuid: 's1',
        errorTag: 'AUDIO_UNAVAILABLE',
        reason: 'HTTP 400 Bad Request',
      }),
    );
    expect(gate.completeSession).toHaveBeenCalledWith('s1');
    expect(transportQueue.confirmReadiness).not.toHaveBeenCalled();
  });

  it('releases the gate even if the failure report cannot be published', async () => {
    transportQueue.reportReadinessFailure.mockResolvedValue(false);
    worker.prepare = async () => {
      throw new TransportPrepareError('gone', 'AUDIO_UNAVAILABLE');
    };

    await worker.ready('s1');

    expect(gate.completeSession).toHaveBeenCalledWith('s1');
  });

  it('leaves a possibly-temporary failure (false) alone', async () => {
    worker.prepare = async () => false;

    await worker.ready('s1');

    expect(transportQueue.reportReadinessFailure).not.toHaveBeenCalled();
    expect(transportQueue.confirmReadiness).not.toHaveBeenCalled();
    expect(gate.completeSession).not.toHaveBeenCalled();
  });
});
