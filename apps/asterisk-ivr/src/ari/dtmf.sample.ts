export class DTMFSample {
  // private client: Client;
  // constructor(client: Client) {
  //   this.client = client;
  // }
  // async playAudio(incoming: Channel) {
  //   //const audio = `${this.config.audioPath}/zev7ahgky7ed5tq68ak191lr`; //NTC
  //   const audio = `${this.config.audioPath}/vm9o6c4445ai9j1zs02gv5pm`; //GOIP
  //   //const audio = `${this.config.audioPath}/${sessionId}`;
  //   const playback = this.client.Playback();
  //   playback.on('PlaybackFinished', async (event, media) => {
  //     try {
  //       //await incoming.hangup();
  //     } catch (error) {}
  //     console.log('=====PlaybackFinished=====', incoming?.caller?.number);
  //   });
  //   await incoming.play(
  //     { media: `sound:${audio}` },
  //     playback,
  //     (err, playback) => {
  //       this.registerDtmfListeners(err, playback, incoming);
  //     }
  //   );
  //   this.logger.log('Playing recording...');
  //   playback.on('PlaybackStarted', (event, media) => {
  //     console.log('=====PlaybackStarted=====', incoming?.caller?.number);
  //   });
  // }
  // registerDtmfListeners(err, playback: Playback, incoming) {
  //   incoming.on(
  //     'ChannelDtmfReceived',
  //     /**
  //      *  Handle DTMF events to control playback. 5 pauses the playback, 8
  //      *  unpauses the playback, 4 moves the playback backwards, 6 moves the
  //      *  playback forwards, 2 restarts the playback, and # stops the playback
  //      *  and hangups the channel.
  //      *
  //      *  @callback channelDtmfReceivedCallback
  //      *  @memberof playback-example
  //      *  @param {Object} event - the full event object
  //      *  @param {module:resources~Channel} channel - the channel on which
  //      *    the dtmf event occured
  //      */
  //     async (event, channel) => {
  //       playback.stop();
  //       const digit = event.digit;
  //       switch (digit) {
  //         case '1':
  //           console.log('=====DTMF 1=====');
  //           break;
  //         case '2':
  //           console.log('=====DTMF 2=====');
  //           await this.recordAudio(channel);
  //           break;
  //         case '3':
  //           console.log('=====DTMF 3=====');
  //           await this.playRecordedAudio(channel);
  //           break;
  //         default:
  //           console.error('Unknown DTMF ', digit);
  //       }
  //     }
  //   );
  // }
  // async recordAudio(channel: Channel) {
  //   // Record
  //   //channel.mute();
  //   const recording = this.client.LiveRecording(channel.id.replace('.', '_'));
  //   console.log(recording.name);
  //   recording.on('RecordingFinished', (event, liveRecording) => {
  //     console.log('=====RecordingFinished=====');
  //     const playback = this.client.Playback();
  //     channel.play({ media: 'sound:vm-msgsaved' }, playback, function (err) {});
  //   });
  //   recording.on('RecordingFailed', (event, liveRecording) => {
  //     console.log('=====RecordingFailed=====');
  //   });
  //   recording.on('RecordingStarted', (event, liveRecording) => {
  //     console.log('=====RecordingStarted=====');
  //   });
  //   const opts = {
  //     name: channel.id.replace('.', '_'),
  //     format: 'wav',
  //     maxSilenceSeconds: 2,
  //     maxDurationSeconds: 60,
  //     beep: true,
  //     ifExists: 'overwrite',
  //     terminateOn: '#',
  //   };
  //   // Record a message
  //   await channel.record(opts, recording, function (err) {});
  // }
  // async playRecordedAudio(channel) {
  //   const playback = this.client.Playback();
  //   playback.on('PlaybackFinished', async (event, media) => {
  //     try {
  //       channel.hangup();
  //     } catch (error) {}
  //     console.log('=====PlaybackFinished=====', channel?.caller?.number);
  //   });
  //   this.client.recordings.listStored((err, recordings) => {
  //     if (err) {
  //       console.error(err);
  //       return;
  //     }
  //     const recording = recordings[recordings.length - 1];
  //     console.log(channel.id.replace('.', '_'));
  //     channel.play(
  //       { media: `recording:${channel.id.replace('.', '_')}` },
  //       playback,
  //       function (err) {
  //         if (err) {
  //           console.error(err);
  //         }
  //       }
  //     );
  //   });
  // }
}
