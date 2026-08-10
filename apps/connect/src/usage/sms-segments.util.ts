export interface SmsSegmentInfo {
  chars: number;
  segments: number;
  perSegment: number;
}

function isGsm7(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isBasic = (code >= 0x20 && code <= 0x7e);
    const isExtended = (code >= 0xa0 && code <= 0xff);
    const isNewline = (code === 0x0a || code === 0x0d);
    const isEuro = code === 0x20ac;
    if (!isBasic && !isExtended && !isNewline && !isEuro) {
      return false;
    }
  }
  return true;
}

export function getSmsSegments(text: string): SmsSegmentInfo {
  const isUnicode = !isGsm7(text);
  const perSegment = isUnicode ? 70 : 160;
  return {
    chars: text.length,
    segments: Math.ceil(text.length / perSegment),
    perSegment,
  };
}
