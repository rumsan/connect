import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

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

  onModuleDestroy() {
    this.clearSessionTimeout();
  }

  async enqueue(sessionCuid: string, work: () => Promise<void>) {
    if (!this.activeSessionCuid) {
      this.activeSessionCuid = sessionCuid;
      this.logger.log(`Session ${sessionCuid} is now active`);
      this.resetSessionTimeout(sessionCuid);
      this.runWork(sessionCuid, work);
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
    this.clearSessionTimeout();
    this.startNext();
  }

  private startNext() {
    if (this.pendingQueue.length === 0) return;

    const next = this.pendingQueue.shift();
    this.activeSessionCuid = next.sessionCuid;
    this.logger.log(
      `Session ${next.sessionCuid} is now active (${this.pendingQueue.length} remaining)`,
    );
    this.resetSessionTimeout(next.sessionCuid);
    this.runWork(next.sessionCuid, next.work);
  }

  private runWork(sessionCuid: string, work: () => Promise<void>) {
    work().catch((err) =>
      this.logger.error(
        `Work failed for session ${sessionCuid}: ${err.message}`,
      ),
    );
  }

  private resetSessionTimeout(sessionCuid: string) {
    this.clearSessionTimeout();
    this.sessionTimeout = setTimeout(() => {
      if (this.activeSessionCuid === sessionCuid) {
        this.logger.warn(
          `Session ${sessionCuid} timed out after ${this.sessionTimeoutMs}ms, force-completing`,
        );
        this.activeSessionCuid = null;
        this.startNext();
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
