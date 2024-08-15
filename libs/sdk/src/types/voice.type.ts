export type CallDetails = {
  trunk: string;
  disposition: CallDisposition;
  answerTime?: Date;
  endTime?: Date;
  duration?: number;
  uniqueId?: string;
  hangupCode?: string;
  hangupDetails?: Record<string, string>;
  cdr?: Record<string, string>;
};

export enum CallDisposition {
  ANSWERED = 'ANSWERED', //cause 16, channel 6, cdr=y
  ANSWER_PARTIAL = 'ANSWER_PARTIAL', //cause 16, channel 6, cdr=y
  NO_ANSWER = 'NO ANSWER', //cause 19, channel 5
  REJECTED = 'REJECTED', //cause 21, channel 5
  NOT_FOUND = 'NOT FOUND', //cause 16, channel 0
  BUSY = 'BUSY', //cause 17, channel 0
  FAILED = 'FAILED',
}
