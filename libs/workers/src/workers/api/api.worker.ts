import { Inject, Injectable, Logger } from '@nestjs/common';
import { BroadcastLogQueue, TransportQueue } from '@rsconnect/queue';
import { ApiTransport, extractBulkDataTemplate } from '@rsconnect/transports';
import { QUEUES } from '@rumsan/connect';
import {
  BroadcastJobData,
  BroadcastStatus,
  Message,
  QueueBroadcastJobData,
  QueueBroadcastLog,
  Session,
  TransportApiConfig,
} from '@rumsan/connect/types';
import { ChannelWrapper } from 'amqp-connection-manager';
import { IDataProvider } from '../../data-providers/data-provider.interface';
import { TransportWorker } from '../transport.worker';

@Injectable()
export class ApiWorker extends TransportWorker {
  queueTransport: QUEUES = QUEUES.TRANSPORT_API;

  private readonly logger = new Logger(ApiWorker.name);
  constructor(
    @Inject('IDataProvider')
    override readonly dataProvider: IDataProvider,
    @Inject('AMQP_CONNECTION')
    override readonly channel: ChannelWrapper,
    override readonly transportQueue: TransportQueue,
    private readonly transport: ApiTransport,
    private readonly broadcastLogQueue: BroadcastLogQueue,
  ) {
    super(dataProvider, channel, transportQueue);
  }

  override async _sendBroadcast(jobData: QueueBroadcastJobData) {
    this.logger.log(
      `Processing broadcast job for session: ${jobData.sessionId}`,
    );
    const session: Session = await this.dataProvider.getSession(
      jobData.sessionId,
    );

    this.transport.init(session.Transport?.config as TransportApiConfig);
    const bulkDataTpl = extractBulkDataTemplate(session.Transport?.config);

    if (bulkDataTpl) {
      this.sendBulkBroadcast(session, jobData);
    } else {
      for (const job of jobData.broadcasts) {
        const broadcastLog: QueueBroadcastLog = {
          broadcastLogId: job.broadcastLogId,
          broadcastId: job.broadcastId,
          sessionId: jobData.sessionId,
          attempt: job.attempt,
          status: BroadcastStatus.PENDING,
          queue: this.queueTransport,
        };

        await this.sendBroadcast({
          session,
          broadcastLog,
          broadcastJob: job,
        });
      }
    }
    await this._makeTransportReady(jobData.sessionId);
  }

  async sendBulkBroadcast(
    session: Session,
    jobData: QueueBroadcastJobData,
  ): Promise<void> {
    this.logger.log(
      `Processing bulk broadcast job for session: ${jobData.sessionId}`,
    );
    const addresses = jobData.broadcasts.map((b) => b.address);
    let result;
    let status = BroadcastStatus.SUCCESS;
    try {
      result = await this.transport.sendBulk(
        addresses,
        session.message as Message,
      );
    } catch (e: any) {
      this.logger.error(
        `Failed to send bulk broadcast for session: ${jobData.sessionId}`,
        e,
      );
      result = { error: e.message, data: e?.response?.data };
      status = BroadcastStatus.FAIL;
    }

    for (const job of jobData.broadcasts) {
      const broadcastLog: QueueBroadcastLog = {
        broadcastLogId: job.broadcastLogId,
        broadcastId: job.broadcastId,
        sessionId: jobData.sessionId,
        attempt: job.attempt,
        status,
        queue: this.queueTransport,
        details: result,
      };
      await this.broadcastLogQueue.add(broadcastLog);
    }
  }

  async sendBroadcast(data: {
    session: Session;
    broadcastJob: BroadcastJobData;
    broadcastLog: QueueBroadcastLog;
  }): Promise<QueueBroadcastLog> {
    this.logger.log(
      `Sending broadcast for session: ${data.session.cuid}, address: ${data.broadcastJob.address}`,
    );
    const { session, broadcastLog, broadcastJob } = data;

    try {
      const res = await this.transport.send(
        broadcastJob.address,
        session.message as Message,
      );

      broadcastLog.status = BroadcastStatus.SUCCESS;
      broadcastLog.details = res;
    } catch (e: any) {
      this.logger.error(
        `Failed to send broadcast for session: ${session.cuid}, address: ${broadcastJob.address}`,
        e,
      );
      broadcastLog.status = BroadcastStatus.FAIL;
      broadcastLog.details = { error: e.message, data: e?.response?.data };
    }

    //send log to connect server
    await this.broadcastLogQueue.add(broadcastLog);
    return broadcastLog;
  }

  async makeTransportReady(sessionCuid: string): Promise<boolean> {
    //TODO: Ping api to check if it is ready
    return true;
  }
}
