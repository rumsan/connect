import { Injectable, Logger } from '@nestjs/common';
import { Session } from '@rumsan/connect/types';
import axios from 'axios';
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
    this.logger.log('Preparing audio file for Asterisk');
    // download file from message.content
    await this.downloadFile(session.message.content, rawFile);
    this.logger.log('Audio file downloaded successfully');

    //convert file bitrate using ffmpeg
    await this.convertAudio(rawFile, convertedFile);
    this.logger.log('Audio file converted successfully');

    // upload file to asterisk server
    await this.uploadFileToRemote(convertedFile, asteriskFile);
    this.logger.log('Audio file uploaded to Asterisk server successfully');
    // delete local files
    await this.removeFiles([rawFile, convertedFile]);
    return true;
  }

  async makeJSONReady(session: Session) {
    const { data: record } = await axios(session.message.content);
    const messageContentHash = session.message.content.split('/').pop();
    // TODO: Check if the JSON sample is following the pattern
    const urls = await this.extractAudioURLs(record);
    for (const url of urls) {
      const urlHash = url.split('/').pop();
      const rawFile = `.data/${urlHash}-raw.wav`;
      const convertedFile = `.data/${urlHash}.wav`;
      const asteriskFile = `${sftpConfig.audioPath}/${urlHash}.wav`;
      // download file from message.content
      await this.downloadFile(url, rawFile);

      //convert file bitrate using ffmpeg
      await this.convertAudio(rawFile, convertedFile);

      // upload file to asterisk server
      await this.uploadFileToRemote(convertedFile, asteriskFile);

      // delete local files
      await this.removeFiles([rawFile, convertedFile]);

      // Update existing JSON with asteriskFileUrl
      await this.replacePromptsIfMatch(record, url, asteriskFile);
    }
    return { url: messageContentHash, preparedData: record };
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
    return true;
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

  async extractAudioURLs(data: unknown) {
    // Regular expression to match URLs
    const urlPattern = /https?:\/\/[^\s,]+/g;

    // Function to recursively extract URLs from the JSON
    function extractUrls(obj, parentKey = '') {
      let urls = [];
      if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          // Skip the 'destination' key
          if (key !== 'destination') {
            urls = urls.concat(extractUrls(obj[key], key));
          }
        }
      } else if (typeof obj === 'string' && urlPattern.test(obj)) {
        urls.push(obj.match(urlPattern)[0]); // Extract the URL from the string
      }
      return urls;
    }

    // Extract URLs and remove duplicates
    const urls = [...new Set(extractUrls(data))];
    return urls;
  }

  async replacePromptsIfMatch(obj: any, oldPrompt: string, newPrompt: string) {
    for (const key in obj) {
      if (typeof obj[key] === 'object') {
        this.replacePromptsIfMatch(obj[key], oldPrompt, newPrompt); // Recursively call for nested objects
      } else if (key === 'prompt' && obj[key] === oldPrompt) {
        obj[key] = `sound:${newPrompt}`; // Replace only if the prompt matches the oldPrompt
      }
    }
    return true;
  }

  async uploadFileToRemote(inputFilePath: string, remoteFilePath: string) {
    try {
      await this.sftp.connect(sftpConfig);
      await this.sftp.put(inputFilePath, remoteFilePath);
      return true;
    } catch (err) {
      console.log({ err });
      this.logger.error(err);
      throw err;
    } finally {
      await this.sftp.end();
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
