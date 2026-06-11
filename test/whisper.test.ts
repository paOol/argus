import { describe, expect, it } from 'vitest';

import { TranscriptionError } from '../src/errors.js';
import { parseWhisperJson } from '../src/whisper.js';

const SAMPLE = JSON.stringify({
  systeminfo: 'AVX = 1',
  result: { language: 'en' },
  transcription: [
    {
      timestamps: { from: '00:00:00,000', to: '00:00:02,500' },
      offsets: { from: 0, to: 2500 },
      text: ' Hello world.',
    },
    {
      timestamps: { from: '00:00:02,500', to: '00:00:05,000' },
      offsets: { from: 2500, to: 5000 },
      text: ' This is a test.',
    },
    {
      timestamps: { from: '00:00:05,000', to: '00:00:05,500' },
      offsets: { from: 5000, to: 5500 },
      text: '   ',
    },
  ],
});

describe('parseWhisperJson', () => {
  it('parses segments with second-based offsets', () => {
    const output = parseWhisperJson(SAMPLE, 'unknown');
    expect(output.segments).toEqual([
      { start: 0, end: 2.5, text: 'Hello world.' },
      { start: 2.5, end: 5, text: 'This is a test.' },
    ]);
    expect(output.text).toBe('Hello world. This is a test.');
    expect(output.language).toBe('en');
  });

  it('falls back to the requested language when whisper omits it', () => {
    const output = parseWhisperJson(JSON.stringify({ transcription: [] }), 'zh');
    expect(output.language).toBe('zh');
    expect(output.text).toBe('');
  });

  it('throws TranscriptionError on malformed JSON', () => {
    expect(() => parseWhisperJson('not json', 'en')).toThrow(TranscriptionError);
  });
});
