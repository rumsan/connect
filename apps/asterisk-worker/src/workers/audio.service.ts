import { Injectable, Logger } from '@nestjs/common';
import { Session } from '@rumsan/connect/types';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs/promises';
import { dirname } from 'path';
import Client from 'ssh2-sftp-client';

const sftpConfig = {
  host: process.env.ASTERISK_HOST,
  port: Number(process.env.ASTERISK_SSH_PORT),
  username: process.env.ASTERISK_SSH_USER,
  password: process.env.ASTERISK_SSH_PASS,
  audioPath: process.env.ASTERISK_AUDIO_PATH,
};

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);
  private sftp: Client;

  constructor() {
    this.sftp = new Client();
  }

  async makeAudioReady(session: Session) {
    const rawFile = `.data/${session.cuid}-raw.wav`;
    const convertedFile = `.data/${session.cuid}.wav`;
    const asteriskFile = `${sftpConfig.audioPath}/${session.cuid}.wav`;

    // download file from message.content
    await this.downloadFile(session.message.content, rawFile);

    //convert file bitrate using ffmpeg
    await this.convertAudio(rawFile, convertedFile);

    // upload file to asterisk server
    await this.uploadFileToRemote(convertedFile, asteriskFile);

    // delete local files
    await this.removeFiles([rawFile, convertedFile]);
    return true;
  }

  async downloadFile(url: string, outputPath: string) {
    this.logger.log('Fetching file from media URL.');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ensure the directory exists
    await fs.mkdir(dirname(outputPath), { recursive: true });

    await fs.writeFile(outputPath, buffer);
    this.logger.log('Audio file fetch complete.');
  }

  async convertAudio(inputFilePath: string, outputFilePath: string) {
    this.logger.log('Starting audio conversion to .wav');

    return new Promise((resolve, reject) => {
      ffmpeg(inputFilePath)
        .audioChannels(1)
        .audioFrequency(8000)
        .toFormat('wav')
        .on('end', () => {
          this.logger.log('Audio conversion complete');

          resolve(outputFilePath);
        })
        .on('error', (err) => {
          this.logger.error(
            'An error occurred during conversion: ' + err.message,
          );
          reject(err);
        })
        .save(outputFilePath);
    });
  }

  async uploadFileToRemote(inputFilePath: string, remoteFilePath: string) {
    try {
      await this.sftp.connect(sftpConfig);
      await this.sftp.put(inputFilePath, remoteFilePath);
      this.sftp.end();
      return true;
    } catch (err) {
      this.logger.error(err);
      this.sftp.end();
      throw err;
    }
  }

  async removeFiles(path: string[]) {
    for (const file of path) {
      try {
        await fs.unlink(file);
      } catch (err) {
        this.logger.error(`Failed to delete file: ${file}`);
      }
    }
  }
}
