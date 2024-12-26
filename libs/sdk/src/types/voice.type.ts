export type CallDetails = {
  trunk: string;
  disposition: CallDisposition;
  answerTime?: string;
  endTime?: string;
  duration?: number;
  hangupDetails?: Record<string, string>;
  cdr?: Record<string, string>;
  ivrSequence?: string[];
};

export enum CallDisposition {
  ANSWERED = 'ANSWERED', //cause 16, channel 6, cdr=y
  NO_ANSWER = 'NO ANSWER', //cause 19, channel 5
  REJECTED = 'REJECTED', //cause 21, channel 5
  NOT_FOUND = 'NOT FOUND', //cause 16, channel 0
  BUSY = 'BUSY', //cause 17, channel 0
  CONGESION = 'CONGESION', //cause 34, channel 0
  FAILED = 'FAILED',
}
