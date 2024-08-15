import * as fs from 'fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import Client from 'ssh2-sftp-client';
import { dirname } from 'path';

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
            'An error occurred during conversion: ' + err.message
          );
          reject(err);
        })
        .save(outputFilePath);
    });
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
