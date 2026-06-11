import { describe, expect, it } from 'vitest';

import { toSrt, toTimestampedText, toVtt } from '../src/format.js';
import type { TranscriptSegment } from '../src/types.js';

const segments: TranscriptSegment[] = [
  { start: 0, end: 2.5, text: 'Hello world.' },
  { start: 62.75, end: 3661.2, text: 'Later on.' },
];

describe('toSrt', () => {
  it('renders numbered cues with comma milliseconds', () => {
    expect(toSrt(segments)).toBe(
      '1\n00:00:00,000 --> 00:00:02,500\nHello world.\n' +
        '\n2\n00:01:02,750 --> 01:01:01,200\nLater on.\n',
    );
  });
});

describe('toVtt', () => {
  it('renders a WEBVTT header and dot milliseconds', () => {
    const vtt = toVtt(segments);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:02.500');
  });
});

describe('toTimestampedText', () => {
  it('renders [mm:ss] prefixes', () => {
    expect(toTimestampedText(segments)).toBe('[00:00] Hello world.\n[01:02] Later on.');
  });
});
