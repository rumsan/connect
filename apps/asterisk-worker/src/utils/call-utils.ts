import { CallDisposition } from '@rumsan/connect/types';

export function getAsteriskDisposition(
  hangupCause: number,
  channelState: number,
): CallDisposition {
  if (channelState === 6) {
    return CallDisposition.ANSWERED;
  }

  if (channelState === 5) {
    if (hangupCause === 19) {
      return CallDisposition.NO_ANSWER;
    }
    if (hangupCause === 21) {
      return CallDisposition.REJECTED;
    }
  }

  if (channelState === 0) {
    if (hangupCause === 16) {
      return CallDisposition.NOT_FOUND;
    }
    if (hangupCause === 17) {
      return CallDisposition.BUSY;
    }
  }

  return CallDisposition.FAILED;
}
