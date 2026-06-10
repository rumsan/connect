import { Injectable, Logger } from '@nestjs/common';
import { Channel, Client } from 'ari-client';
import { ChannelStateManager } from './channel-state.manager';

@Injectable()
export class PlaybackService {
  private readonly logger = new Logger(PlaybackService.name);
  private client: Client;
  private audioPath: string;

  constructor(private readonly channelStateManager: ChannelStateManager) {
    this.audioPath = process.env.ASTERISK_AUDIO_PATH || '';
  }

  setClient(client: Client) {
    this.client = client;
  }

  async playAudio(sessionId: string, channel: Channel) {
    const channelId = channel.id;
    const channelState = this.channelStateManager.getState(channelId);

    if (!channelState?.isActive) {
      this.logger.warn(
        `Attempted to play audio on inactive or unknown channel: ${channelId}`,
      );
      return;
    }

    const audio = `${this.audioPath}/${sessionId}`;
    const playbackId = `${channelId}-${Date.now()}`;

    const playback = this.client.Playback();
    channelState.activePlayback = playback;
    channelState.activePlaybackId = playbackId;

    playback.once('PlaybackStarted', () => {
      if (channelState.activePlaybackId !== playbackId) return;
      this.channelStateManager.markPlaybackStarted(channelId);
      this.logger.log(
        `PlaybackStarted for channel: ${channelId}, media: ${audio}`,
      );
    });

    playback.once('PlaybackFinished', async () => {
      if (channelState.activePlaybackId !== playbackId) {
        this.logger.log(
          `PlaybackFinished for stale playback on channel: ${channelId}, ignoring`,
        );
        return;
      }

      channelState.activePlayback = null;
      channelState.activePlaybackId = null;

      // If PlaybackStarted never fired, the media was missing/invalid and
      // Asterisk skipped straight to PlaybackFinished. Tag silent failure.
      if (!channelState.playbackStarted) {
        this.channelStateManager.markPlaybackFailed(
          channelId,
          'PlaybackFinished without PlaybackStarted (media missing or invalid)',
        );
        this.logger.error(
          `Silent playback failure on channel ${channelId}, media: ${audio}`,
        );
      } else {
        this.logger.log(
          `PlaybackFinished for channel: ${channelId}, caller: ${channel?.caller?.number}`,
        );
      }

      try {
        if (channelState.isActive) {
          await channel.hangup();
        }
      } catch (err) {
        this.logger.debug(
          `Hangup after audio playback failed for channel ${channelId} (likely already gone): ${(err as Error).message}`,
        );
      }
    });

    try {
      await channel.play(
        { playbackId: playbackId, media: `sound:${audio}` },
        playback,
      );
      this.logger.log(`Playing recording for channel: ${channelId}`);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(
        `Error starting audio playback on channel ${channelId}: ${message}`,
      );
      this.channelStateManager.markPlaybackFailed(channelId, message);
      channelState.activePlayback = null;
      channelState.activePlaybackId = null;
    }
  }

  async playPrompt(
    channelId: string,
    media: string,
    immediateHangup = false,
  ) {
    const channelState = this.channelStateManager.getState(channelId);
    if (!channelState?.isActive) {
      this.logger.warn(
        `Attempted to play prompt on inactive or unknown channel: ${channelId}`,
      );
      return;
    }

    try {
      await this.channelStateManager.stopActivePlayback(channelId);
      this.channelStateManager.cancelScheduledHangup(channelId);

      const playback = this.client.Playback();
      const playbackId = playback.id;
      channelState.activePlayback = playback;
      channelState.activePlaybackId = playbackId;

      playback.once('PlaybackStarted', () => {
        if (channelState.activePlaybackId !== playbackId) return;
        this.channelStateManager.markPlaybackStarted(channelId);
        this.logger.log(
          `PlaybackStarted: ${media} on channel: ${channelId}`,
        );
      });

      playback.once('PlaybackFinished', async () => {
        if (channelState.activePlaybackId !== playbackId) {
          this.logger.log(
            `PlaybackFinished for stale playback on channel: ${channelId}, ignoring`,
          );
          return;
        }

        channelState.activePlayback = null;
        channelState.activePlaybackId = null;

        if (!channelState.playbackStarted) {
          this.channelStateManager.markPlaybackFailed(
            channelId,
            'PlaybackFinished without PlaybackStarted (media missing or invalid)',
          );
          this.logger.error(
            `Silent playback failure on channel ${channelId}, media: ${media}`,
          );
          // Force hangup so the call doesn't sit silent
          try {
            await this.client.channels.hangup({ channelId });
          } catch (err) {
            this.logger.debug(
              `Hangup after silent playback failure for channel ${channelId}: ${(err as Error).message}`,
            );
          }
          return;
        }

        this.logger.log(`Playback finished on channel: ${channelId}`);

        if (immediateHangup) {
          try {
            await this.client.channels.hangup({ channelId });
            this.logger.log(
              `Channel ${channelId} hung up after playback (hangup: true)`,
            );
          } catch (err) {
            this.logger.debug(
              `Hangup after prompt failed for channel ${channelId} (likely already gone): ${(err as Error).message}`,
            );
          }
          // Cleanup will be triggered by StasisEnd event
        } else if (channelState.isActive) {
          this.channelStateManager.scheduleHangup(channelId, 10000);
        }
      });

      await this.client.channels.play({
        channelId: channelId,
        playbackId: playbackId,
        media: media,
      });

      this.logger.log(`Playback started: ${media} on channel: ${channelId}`);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(
        `Error playing prompt on channel ${channelId}: ${message}`,
      );
      this.channelStateManager.markPlaybackFailed(channelId, message);
      channelState.activePlayback = null;
      channelState.activePlaybackId = null;
    }
  }
}
