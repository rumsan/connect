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

    playback.once('PlaybackFinished', async () => {
      if (channelState.activePlaybackId !== playbackId) {
        this.logger.log(
          `PlaybackFinished for stale playback on channel: ${channelId}, ignoring`,
        );
        return;
      }

      channelState.activePlayback = null;
      channelState.activePlaybackId = null;

      this.logger.log(
        `PlaybackFinished for channel: ${channelId}, caller: ${channel?.caller?.number}`,
      );

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
      this.logger.error(
        `Error starting audio playback on channel ${channelId}: ${(err as Error).message}`,
      );
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

      await this.client.channels.play({
        channelId: channelId,
        playbackId: playbackId,
        media: media,
      });

      this.logger.log(`Playback started: ${media} on channel: ${channelId}`);

      playback.once('PlaybackFinished', async () => {
        if (channelState.activePlaybackId !== playbackId) {
          this.logger.log(
            `PlaybackFinished for stale playback on channel: ${channelId}, ignoring`,
          );
          return;
        }

        this.logger.log(`Playback finished on channel: ${channelId}`);
        channelState.activePlayback = null;
        channelState.activePlaybackId = null;

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
    } catch (err) {
      this.logger.error(
        `Error playing prompt on channel ${channelId}: ${(err as Error).message}`,
      );
      channelState.activePlayback = null;
      channelState.activePlaybackId = null;
    }
  }
}
