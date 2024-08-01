import * as fs from 'fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import Client from 'ssh2-sftp-client';

interface SFTPConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

@Injectable()
export class AudioHelper {
  private readonly logger = new Logger(AudioHelper.name);
  private sftp: Client;

  constructor() {
    this.sftp = new Client();
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
            'An error occurred during conversion: ' + err.message
          );
          reject(err);
        })
        .save(outputFilePath);
    });
  }

  async getS3File(url: string, outputPath: string) {
    this.logger.log('Fetching file from media URL.');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from S3: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(outputPath, buffer);
    this.logger.log('Fetch complete.');
  }

  async uploadFileToRemote(
    inputFilePath: string,
    remoteFilePath: string,
    config: SFTPConfig
  ) {
    try {
      await this.sftp.connect(config);
      await this.sftp.put(inputFilePath, remoteFilePath);
      this.sftp.end();
      return true;
    } catch (err) {
      this.logger.error(err);
      this.sftp.end();
      throw err;
    }
  }

  async removeFile(path: string) {
    return fs.unlink(path);
  }
}
