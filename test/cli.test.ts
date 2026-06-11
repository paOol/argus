import { describe, expect, it } from 'vitest';

import { parseArgs } from '../src/cli.js';

describe('parseArgs', () => {
  it('parses a bare URL', () => {
    const flags = parseArgs(['https://youtu.be/abc']);
    expect(flags.url).toBe('https://youtu.be/abc');
    expect(flags.format).toBe('text');
  });

  it('parses options around the URL', () => {
    const flags = parseArgs([
      '-m', 'small',
      'https://t.me/durov/1',
      '-l', 'zh',
      '-f', 'srt',
      '-o', 'out.srt',
      '--threads', '8',
      '--timeout', '300',
      '--keep-audio',
      '-q',
    ]);
    expect(flags).toMatchObject({
      url: 'https://t.me/durov/1',
      model: 'small',
      language: 'zh',
      format: 'srt',
      output: 'out.srt',
      threads: 8,
      timeoutSeconds: 300,
      keepAudio: true,
      quiet: true,
    });
  });

  it('parses the doctor subcommand', () => {
    expect(parseArgs(['doctor']).doctor).toBe(true);
  });

  it('rejects unknown options', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown option/);
  });

  it('rejects unknown formats', () => {
    expect(() => parseArgs(['-f', 'yaml', 'https://x.com/v'])).toThrow(/Unknown format/);
  });

  it('rejects missing option values', () => {
    expect(() => parseArgs(['https://x.com/v', '-m'])).toThrow(/Missing value/);
  });

  it('rejects a second positional argument', () => {
    expect(() => parseArgs(['https://a.com/1', 'https://b.com/2'])).toThrow(/extra argument/);
  });
});
