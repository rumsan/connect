import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { AMIService } from './ami.service';
import { ChannelStateManager } from './channel-state.manager';
import { IVRService } from './ivr.service';

const GRACE_PERIOD_MS = 15_000;

@Injectable()
export class ConnectionLifecycleManager implements OnModuleDestroy {
  private readonly logger = new Logger(ConnectionLifecycleManager.name);
  private currentSessionId: string | null = null;
  private disconnectTimer: NodeJS.Timeout | null = null;
  private isConnected = false;

  constructor(
    private readonly ivrService: IVRService,
    private readonly amiService: AMIService,
    private readonly channelStateManager: ChannelStateManager,
  ) {}

  async startSession(sessionCuid: string): Promise<void> {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      this.logger.log(
        `Cancelled pending disconnect — reusing connection for session ${sessionCuid}`,
      );
    }
    this.channelStateManager.clearDrainCallback();
    this.currentSessionId = sessionCuid;

    if (this.isConnected) return;

    this.logger.log(`Connecting ARI + AMI for session ${sessionCuid}`);
    await this.ivrService.connectForSession();
    this.amiService.connectForSession();
    this.isConnected = true;
    this.logger.log(`ARI + AMI connected for session ${sessionCuid}`);
  }

  endSession(sessionCuid: string) {
    if (this.currentSessionId !== sessionCuid) {
      this.logger.warn(
        `endSession called for ${sessionCuid} but active is ${this.currentSessionId}`,
      );
      return;
    }

    this.currentSessionId = null;

    if (!this.isConnected) return;

    if (this.channelStateManager.activeChannelCount > 0) {
      this.logger.log(
        `Waiting for ${this.channelStateManager.activeChannelCount} active channel(s) to drain before disconnecting`,
      );
      this.channelStateManager.onAllChannelsDrained(() =>
        this.startGracePeriod(),
      );
    } else {
      this.startGracePeriod();
    }
  }

  private startGracePeriod() {
    this.logger.log(
      `All channels drained — disconnecting in ${GRACE_PERIOD_MS / 1000}s`,
    );
    this.disconnectTimer = setTimeout(() => {
      this.disconnectTimer = null;
      this.disconnect();
    }, GRACE_PERIOD_MS);
    this.disconnectTimer.unref?.();
  }

  private disconnect() {
    if (this.currentSessionId !== null) {
      this.logger.log(
        'New session started during grace period — skipping disconnect',
      );
      return;
    }
    if (!this.isConnected) return;

    this.channelStateManager.clearDrainCallback();
    this.ivrService.disconnectForSession();
    this.amiService.disconnectForSession();
    this.isConnected = false;
    this.logger.log('ARI + AMI disconnected (session ended)');
  }

  onModuleDestroy() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    this.channelStateManager.clearDrainCallback();
  }
}
