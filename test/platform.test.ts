import { describe, expect, it } from 'vitest';

import { UnsupportedUrlError } from '../src/errors.js';
import { detectPlatform } from '../src/platform.js';

describe('detectPlatform', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'youtube'],
    ['https://m.youtube.com/watch?v=abc123', 'youtube'],
    ['https://www.youtube.com/shorts/abc123DEF45', 'youtube'],
    ['https://music.youtube.com/watch?v=abc', 'youtube'],
    ['https://www.youtube-nocookie.com/embed/abc', 'youtube'],
    ['https://www.instagram.com/reel/C1234abcd/', 'instagram'],
    ['https://www.instagram.com/p/C1234abcd/', 'instagram'],
    ['https://instagram.com/tv/C1234abcd/', 'instagram'],
    ['https://instagr.am/p/C1234abcd/', 'instagram'],
    ['https://www.xiaohongshu.com/explore/65f1a2b3000000001203abcd', 'xiaohongshu'],
    ['https://www.xiaohongshu.com/discovery/item/65f1a2b3000000001203abcd', 'xiaohongshu'],
    ['http://xhslink.com/a/AbCdEf123', 'xiaohongshu'],
    ['https://www.rednote.com/explore/69ce30d3000000002100791c?xsec_token=ABQ=', 'xiaohongshu'],
    ['https://rednote.com/explore/69ce30d3000000002100791c', 'xiaohongshu'],
    ['https://t.me/durov/123', 'telegram'],
    ['https://t.me/s/durov/123', 'telegram'],
    ['https://telegram.me/somechannel/456', 'telegram'],
    ['https://vimeo.com/12345', 'generic'],
    ['https://www.bilibili.com/video/BV1xx411c7mD', 'generic'],
  ])('%s -> %s', (url, expected) => {
    expect(detectPlatform(url)).toBe(expected);
  });

  it('rejects non-URLs', () => {
    expect(() => detectPlatform('not a url')).toThrow(UnsupportedUrlError);
  });

  it('rejects non-http protocols', () => {
    expect(() => detectPlatform('ftp://example.com/video.mp4')).toThrow(UnsupportedUrlError);
    expect(() => detectPlatform('file:///etc/passwd')).toThrow(UnsupportedUrlError);
  });
});
