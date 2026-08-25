import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { QUEUE_ACTIONS } from '@rumsan/connect';
import { TransportQueue } from '@rsconnect/queue';
import { ConnectionLifecycleManager } from './connection-lifecycle.manager';

interface PendingSession {
  sessionCuid: string;
  work: () => Promise<void>;
}

@Injectable()
export class SessionGate implements OnModuleDestroy {
  private readonly logger = new Logger(SessionGate.name);

  private activeSessionCuid: string | null = null;
  private readonly pendingQueue: PendingSession[] = [];
  private isProcessing = false;
  private sessionTimeout: NodeJS.Timeout | null = null;
  private readonly sessionTimeoutMs =
    +(process.env['SESSION_GATE_TIMEOUT_MS'] as string) || 600_000;

  constructor(
    private readonly connectionLifecycle: ConnectionLifecycleManager,
    private readonly transportQueue: TransportQueue,
  ) {}

  onModuleDestroy() {
    this.clearSessionTimeout();
  }

  /** Session this worker is currently committed to, for heartbeats and health. */
  get activeSession(): string | null {
    return this.activeSessionCuid;
  }

  get pendingCount(): number {
    return this.pendingQueue.length;
  }

  async enqueue(sessionCuid: string, work: () => Promise<void>) {
    if (!this.activeSessionCuid) {
      this.logger.log(`Session ${sessionCuid} is now active`);
      this.activate(sessionCuid, work);
      return;
    }

    if (sessionCuid === this.activeSessionCuid) {
      this.resetSessionTimeout(sessionCuid);
      this.runWork(sessionCuid, work);
      return;
    }

    this.logger.log(
      `Session ${sessionCuid} queued (active: ${this.activeSessionCuid}, pending: ${this.pendingQueue.length})`,
    );
    this.pendingQueue.push({ sessionCuid, work });
  }

  completeSession(sessionCuid: string) {
    if (this.activeSessionCuid !== sessionCuid) {
      this.logger.warn(
        `completeSession called for ${sessionCuid} but active is ${this.activeSessionCuid}`,
      );
      return;
    }
    this.logger.log(`Session ${sessionCuid} completed`);
    this.activeSessionCuid = null;
    this.reportTiming(QUEUE_ACTIONS.SESSION_END, sessionCuid);
    this.clearSessionTimeout();
    this.connectionLifecycle.endSession(sessionCuid);
    this.startNext();
  }

  private startNext() {
    if (this.pendingQueue.length === 0) return;

    const next = this.pendingQueue.shift();
    this.logger.log(
      `Session ${next.sessionCuid} is now active (${this.pendingQueue.length} remaining)`,
    );
    this.activate(next.sessionCuid, next.work);
  }

  /**
   * Claims the gate for a session. This — not enqueue() — is the moment the
   * session actually starts running, so it is where SESSION_START is reported.
   */
  private activate(sessionCuid: string, work: () => Promise<void>) {
    this.activeSessionCuid = sessionCuid;
    this.reportTiming(QUEUE_ACTIONS.SESSION_START, sessionCuid);
    this.resetSessionTimeout(sessionCuid);
    this.runWork(sessionCuid, work);
  }

  private reportTiming(
    action: QUEUE_ACTIONS.SESSION_START | QUEUE_ACTIONS.SESSION_END,
    sessionCuid: string,
  ) {
    // Fire-and-forget: timing telemetry must never interrupt dialling.
    this.transportQueue
      .reportSessionTiming(action, {
        sessionCuid,
        at: new Date().toISOString(),
      })
      .catch((err) =>
        this.logger.error(
          `Failed to report ${action} for session ${sessionCuid}: ${
            (err as Error).message
          }`,
        ),
      );
  }

  private async runWork(sessionCuid: string, work: () => Promise<void>) {
    try {
      await this.connectionLifecycle.startSession(sessionCuid);
      await work();
    } catch (err) {
      this.logger.error(
        `Work failed for session ${sessionCuid}: ${(err as Error).message}`,
      );
    }
  }

  private resetSessionTimeout(sessionCuid: string) {
    this.clearSessionTimeout();
    this.sessionTimeout = setTimeout(() => {
      if (this.activeSessionCuid === sessionCuid) {
        this.logger.warn(
          `Session ${sessionCuid} timed out after ${this.sessionTimeoutMs}ms, force-completing`,
        );
        this.completeSession(sessionCuid);
      }
    }, this.sessionTimeoutMs);
    this.sessionTimeout.unref?.();
  }

  private clearSessionTimeout() {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }
  }
}
