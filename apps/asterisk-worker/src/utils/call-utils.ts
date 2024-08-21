import { CallDisposition } from '@rumsan/connect/types';

export function getAsteriskDisposition(
  hangupCause: string,
  channelState: string,
): CallDisposition {
  if (channelState === '6') {
    return CallDisposition.ANSWERED;
  }

  if (hangupCause === '19' || hangupCause === '19') {
    return CallDisposition.NO_ANSWER;
  }

  if (hangupCause === '16') {
    return CallDisposition.NO_ANSWER;
  }

  if (hangupCause === '21') {
    return CallDisposition.REJECTED;
  }

  if (hangupCause === '16') {
    if (channelState === '5') {
      return CallDisposition.NO_ANSWER;
    }
    if (channelState === '0') {
      return CallDisposition.NOT_FOUND;
    }
  }

  if (hangupCause === '17') {
    return CallDisposition.BUSY;
  }

  if (hangupCause === '34') {
    return CallDisposition.CONGESION;
  }

  return CallDisposition.FAILED;
}
