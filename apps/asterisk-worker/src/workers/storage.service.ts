import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Cloudflare R2. It speaks the S3 API, which is why the AWS SDK is still the
 * client here — but the differences that matter are real:
 *
 * - The endpoint is derived from the account id, and the region is always
 *   'auto'.
 * - **R2 has no ACLs.** There is no `public-read`; a bucket is either exposed
 *   publicly or it isn't, and that is configured in Cloudflare, not per object.
 * - Because of that, the public URL cannot be derived from the bucket name. It
 *   comes from a custom domain or the bucket's r2.dev subdomain, so
 *   R2_PUBLIC_BASE_URL has to be set explicitly — see `configured`.
 */
const r2Config = {
  accountId: process.env.R2_ACCOUNT_ID,
  bucket: process.env.R2_BUCKET,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  // Custom domain, or the bucket's r2.dev subdomain. Required: R2 gives no way
  // to compute a public URL from the bucket name.
  publicBaseUrl: process.env.R2_PUBLIC_BASE_URL || undefined,
  prefix: process.env.R2_RECORDING_PREFIX || 'voice-responses',
};

const endpointFor = (accountId: string) =>
  `https://${accountId}.r2.cloudflarestorage.com`;

/**
 * Make a value safe to use as one object key segment, or return '' if nothing
 * usable is left. `workerLabel()` falls back to the machine hostname when
 * WORKER_ID is unset, and hostnames can carry spaces and other characters that
 * make for awkward keys.
 */
function sanitizeSegment(value?: string): string {
  return (value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64);
}

export interface PutObjectResult {
  url: string;
  key: string;
  sizeBytes: number;
}

/**
 * Publishes voice responses to Cloudflare R2.
 *
 * Deliberately dumb: it knows nothing about calls or reports. When it isn't
 * configured it says so rather than throwing, so a deployment that never set
 * R2 credentials still runs voice broadcasts normally — the recordings simply
 * stay on the Asterisk box and the report says as much.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;

  /**
   * A public base URL is part of being configured, not an optional extra. An
   * upload nobody can read is worse than no upload at all: the recording is
   * deleted from the Asterisk box on success, so a private object would leave
   * a report full of links that 403 and no second copy.
   */
  get configured(): boolean {
    return !!(
      r2Config.accountId &&
      r2Config.bucket &&
      r2Config.accessKeyId &&
      r2Config.secretAccessKey &&
      r2Config.publicBaseUrl
    );
  }

  get bucket(): string | undefined {
    return r2Config.bucket;
  }

  /** Names the env vars that are missing, for a startup message worth reading. */
  get missingConfig(): string[] {
    const required: [string, unknown][] = [
      ['R2_ACCOUNT_ID', r2Config.accountId],
      ['R2_BUCKET', r2Config.bucket],
      ['R2_ACCESS_KEY_ID', r2Config.accessKeyId],
      ['R2_SECRET_ACCESS_KEY', r2Config.secretAccessKey],
      ['R2_PUBLIC_BASE_URL', r2Config.publicBaseUrl],
    ];
    return required.filter(([, value]) => !value).map(([name]) => name);
  }

  onModuleInit() {
    if (!this.configured) {
      this.logger.warn(
        `R2 is not configured (missing ${this.missingConfig.join(', ')}) — ` +
          'voice responses will be recorded and left on the Asterisk box',
      );
      if (this.missingConfig.length === 1 && !r2Config.publicBaseUrl) {
        this.logger.warn(
          'R2_PUBLIC_BASE_URL is the bucket\'s public hostname — connect a custom ' +
            'domain to the bucket, or enable its r2.dev subdomain, in the ' +
            'Cloudflare dashboard under R2 > your bucket > Settings > Public access',
        );
      }
      return;
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: endpointFor(r2Config.accountId),
      forcePathStyle: true,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
      // Recent AWS SDK versions add integrity checksums to every request by
      // default; R2 rejects some of them. Only send one when the operation
      // actually requires it.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    this.logger.log(
      `R2 storage ready: bucket=${r2Config.bucket}, ` +
        `endpoint=${endpointFor(r2Config.accountId)}, ` +
        `public=${r2Config.publicBaseUrl}`,
    );
  }

  /**
   * `voice-responses/<workerId>/<sessionId>/<broadcastLogId>/<name>.<ext>`
   *
   * The worker segment keeps one box's recordings together in the bucket, which
   * is how you find them again when a fleet member misbehaves. It is dropped
   * entirely rather than left as a placeholder when there is no usable worker
   * id, so a single-worker deployment that never set WORKER_ID just gets the
   * shorter path.
   */
  buildKey(params: {
    workerId?: string;
    sessionId: string;
    broadcastLogId: string;
    recordingName: string;
    format: string;
  }): string {
    return [
      r2Config.prefix,
      sanitizeSegment(params.workerId),
      params.sessionId,
      params.broadcastLogId,
      `${params.recordingName}.${params.format}`,
    ]
      .filter(Boolean)
      .join('/');
  }

  /**
   * Uploads and returns the public URL. Nothing is set per object to make it
   * readable — on R2 that is a property of the bucket, so a bucket that is not
   * publicly exposed yields links that 403 no matter what this sends.
   */
  async putPublicObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<PutObjectResult> {
    if (!this.client) {
      throw new Error('STORAGE_NOT_CONFIGURED');
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: r2Config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return { url: this.publicUrl(key), key, sizeBytes: body.length };
  }

  publicUrl(key: string): string {
    return `${(r2Config.publicBaseUrl ?? '').replace(/\/+$/, '')}/${key}`;
  }
}
