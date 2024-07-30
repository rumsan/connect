import { JobOptions } from 'bull';

export const bullOptions: JobOptions = {
  removeOnComplete: 20,
  removeOnFail: 200,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
};
