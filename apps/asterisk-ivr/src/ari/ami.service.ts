// src/ami/ami.service.ts
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import AsteriskManager from 'asterisk-manager';

@Injectable()
export class AmiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AmiService.name);
  private ami: AsteriskManager;
  private readonly amiConfig = {
    host: process.env.ASTERISK_HOST || '127.0.0.1',
    port: +process.env.ASTERISK_AMI_PORT || 5038,
    username: process.env.ASTERISK_AMI_USER || 'admin',
    password: process.env.ASTERISK_AMI_PASS || 'admin',
  };

  private readonly allowedContext = 'from-internal'; // Define your context
  private readonly allowedExtension = '967'; // Define your extension

  async onModuleInit() {
    this.connect();
  }

  async onModuleDestroy() {
    if (this.ami) {
      this.ami.disconnect();
      this.logger.log('Disconnected from AMI');
    }
  }

  private connect() {
    this.ami = new AsteriskManager(
      this.amiConfig.port,
      this.amiConfig.host,
      this.amiConfig.username,
      this.amiConfig.password,
      true
    );

    this.ami.on('managerevent', (event) => {
      //this.logger.log('Received AMI event:');

      // Only handle Newchannel events
      if (event.event === 'Newchannel') {
        console.log(event);
        const channel = event.channel;
        const context = event.context;
        const extension = event.exten;

        // Filter based on context and extension
        if (
          context === this.allowedContext &&
          extension === this.allowedExtension
        ) {
          this.logger.log(
            `Incoming call detected on channel ${channel} for context ${context} and extension ${extension}`
          );
          this.answerCall(channel);
        } else {
          this.logger.log(
            `Call on channel ${channel} is not for the allowed context or extension.`
          );
        }
      }
    });

    this.ami.on('error', (err) => {
      this.logger.error('AMI connection error:', err);
    });

    this.ami.on('close', () => {
      this.logger.warn('Connection to AMI closed');
    });

    this.logger.log('Connected to AMI');
  }

  private answerCall(channel: string) {
    this.logger.log(`Answering call on channel ${channel}`);
    this.ami.action(
      {
        action: 'Originate',
        channel: channel,
        context: this.allowedContext,
        exten: this.allowedExtension,
        priority: 1,
        async: true,
      },
      (err, res) => {
        if (err) {
          this.logger.error('Error answering call:', err);
        } else {
          this.logger.log('Call answered successfully:', res);
        }
      }
    );
  }

  private playAudio(channel: string, audioFile: string) {
    this.logger.log(`Playing audio ${audioFile} on channel ${channel}`);
    this.ami.action(
      {
        action: 'Redirect',
        channel: channel,
        context: this.allowedContext,
        exten: audioFile,
        priority: 1,
      },
      (err, res) => {
        if (err) {
          this.logger.error('Error playing audio:', err);
        } else {
          this.logger.log('Audio played successfully:', res);
        }
      }
    );
  }
}
