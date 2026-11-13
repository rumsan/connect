import { Injectable, Logger } from '@nestjs/common';
import { workerLabel } from '@rsconnect/queue';
import { TransportPrepareError } from '@rsconnect/workers';
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

/**
 * Scratch space for downloads and ffmpeg output, scoped per worker so two
 * instances on one host can prepare the same session concurrently without
 * overwriting each other mid-transfer. The remote path stays keyed by session
 * cuid — each worker uploads to its own Asterisk box.
 */
const SCRATCH_DIR = `.data/${workerLabel()}`;

/** Per request. `fetch` has no timeout of its own, so a stalled host would hang preparation. */
const FETCH_TIMEOUT_MS =
  +(process.env['AUDIO_FETCH_TIMEOUT_MS'] as string) || 30_000;
/** Total tries for a temporary failure (5xx, 408, 429, network, timeout). */
const FETCH_ATTEMPTS =
  +(process.env['AUDIO_FETCH_ATTEMPTS'] as string) || 3;
const FETCH_RETRY_BASE_MS = 2_000;

/**
 * The session's media cannot be fetched and retrying will not change that.
 * Fails the whole session: every number would hear silence anyway.
 */
export class AudioUnavailableError extends TransportPrepareError {
  constructor(url: string, detail: string) {
    super(`Audio not accessible at ${url}: ${detail}`, 'AUDIO_UNAVAILABLE');
    this.name = 'AudioUnavailableError';
  }
}

const isTemporaryStatus = (status: number) =>
  status >= 500 || status === 408 || status === 429;

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);
  private sftp: Client;

  constructor() {
    this.sftp = new Client();
  }

  async makeAudioReady(session: Session) {
    const rawFile = `${SCRATCH_DIR}/${session.cuid}-raw.wav`;
    const convertedFile = `${SCRATCH_DIR}/${session.cuid}.wav`;
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
    const url = session.message.content;
    const response = await this.fetchMedia(url);
    let record: any;
    try {
      record = await response.json();
    } catch (err) {
      throw new AudioUnavailableError(
        url,
        `IVR plan is not valid JSON (${(err as Error).message})`,
      );
    }
    const messageContentHash = session.message.content.split('/').pop();
    // TODO: Check if the JSON sample is following the pattern
    const urls = await this.extractAudioURLs(record);
    for (const url of urls) {
      const urlHash = url.split('/').pop();
      const rawFile = `${SCRATCH_DIR}/${urlHash}-raw.wav`;
      const convertedFile = `${SCRATCH_DIR}/${urlHash}.wav`;
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

    const response = await this.fetchMedia(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ensure the directory exists
    await fs.mkdir(dirname(outputPath), { recursive: true });

    await fs.writeFile(outputPath, buffer);
    this.logger.log('Audio file fetch complete.');
    return true;
  }

  /**
   * GET a session's media, retrying what may be temporary. A 4xx (other than
   * 408/429) is final at once; anything still failing after FETCH_ATTEMPTS is
   * final too. Either way it throws AudioUnavailableError, which fails the
   * session rather than leaving the worker holding it.
   */
  async fetchMedia(url: string): Promise<Response> {
    let lastDetail = '';
    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (response.ok) return response;

        lastDetail = await describeFailedResponse(response);
        if (!isTemporaryStatus(response.status)) {
          throw new AudioUnavailableError(url, lastDetail);
        }
      } catch (err) {
        if (err instanceof AudioUnavailableError) throw err;
        lastDetail = describeFetchError(err);
      }

      this.logger.warn(
        `Fetching ${url} failed (attempt ${attempt}/${FETCH_ATTEMPTS}): ${lastDetail}`,
      );
      if (attempt < FETCH_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, FETCH_RETRY_BASE_MS * attempt));
      }
    }
    throw new AudioUnavailableError(
      url,
      `${lastDetail} (gave up after ${FETCH_ATTEMPTS} attempts)`,
    );
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

/** `HTTP 400 Bad Request: <start of body>` — the body is often the only clue. */
async function describeFailedResponse(response: Response): Promise<string> {
  let body = '';
  try {
    body = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch {
    // The status line is enough.
  }
  return `HTTP ${response.status} ${response.statusText}`.trim() +
    (body ? `: ${body}` : '');
}

function describeFetchError(err: unknown): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e?.name === 'TimeoutError') return `no response within ${FETCH_TIMEOUT_MS}ms`;
  const cause = e?.cause?.code ?? e?.cause?.message;
  return cause ? `${e.message} (${cause})` : e?.message ?? String(err);
}
