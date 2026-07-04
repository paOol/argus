import { describe, expect, it } from 'vitest';

import {
  buildSyndicationToken,
  extractTwitterImagesFromSyndication,
  extractTwitterVideoFromSyndication,
  parseTwitterStatusUrl,
  pickAudioRenditionUrl,
} from '../src/twitter.js';

describe('parseTwitterStatusUrl', () => {
  it('extracts id and handle from a standard status URL', () => {
    expect(parseTwitterStatusUrl('https://x.com/ai_rohitt/status/2067481249351176586')).toEqual({
      id: '2067481249351176586',
      screenName: 'ai_rohitt',
    });
  });

  it('accepts twitter.com and trailing path/query segments', () => {
    expect(parseTwitterStatusUrl('https://twitter.com/jack/status/20/photo/1?s=20')).toEqual({
      id: '20',
      screenName: 'jack',
    });
  });

  it('handles /i/web/status and /i/status without an author handle', () => {
    expect(parseTwitterStatusUrl('https://x.com/i/web/status/12345')).toEqual({ id: '12345' });
    expect(parseTwitterStatusUrl('https://x.com/i/status/12345')).toEqual({ id: '12345' });
  });

  it('returns null for non-status URLs and garbage', () => {
    expect(parseTwitterStatusUrl('https://x.com/jack')).toBeNull();
    expect(parseTwitterStatusUrl('https://x.com/search?q=hi')).toBeNull();
    expect(parseTwitterStatusUrl('not a url')).toBeNull();
  });
});

describe('buildSyndicationToken', () => {
  it('derives the documented token from the tweet id', () => {
    // Verified against the live endpoint for this id.
    expect(buildSyndicationToken('2067481249351176586')).toBe('5f6mc8rle');
  });
});

describe('extractTwitterVideoFromSyndication', () => {
  it('prefers the HLS master from the `video.variants` shape', () => {
    const json = {
      text: 'Look at this\ncool clip https://t.co/abc',
      video: {
        variants: [
          { type: 'application/x-mpegURL', src: 'https://video.twimg.com/x/pl/master.m3u8?v=1' },
          { type: 'video/mp4', src: 'https://video.twimg.com/x/vid/480x270/a.mp4' },
        ],
      },
    };
    expect(extractTwitterVideoFromSyndication(json)).toEqual({
      videoUrl: 'https://video.twimg.com/x/pl/master.m3u8?v=1',
      isHls: true,
      title: 'Look at this cool clip https://t.co/abc',
    });
  });

  it('falls back to the highest-bitrate MP4 from the `mediaDetails` shape', () => {
    const json = {
      text: 'gif',
      mediaDetails: [
        {
          type: 'video',
          video_info: {
            variants: [
              { bitrate: 256000, content_type: 'video/mp4', url: 'https://video.twimg.com/lo.mp4' },
              { bitrate: 832000, content_type: 'video/mp4', url: 'https://video.twimg.com/hi.mp4' },
            ],
          },
        },
      ],
    };
    expect(extractTwitterVideoFromSyndication(json)).toEqual({
      videoUrl: 'https://video.twimg.com/hi.mp4',
      isHls: false,
      title: 'gif',
    });
  });

  it('returns null for a tweet with no video', () => {
    expect(extractTwitterVideoFromSyndication({ text: 'just text', photos: [{}] })).toBeNull();
    expect(extractTwitterVideoFromSyndication({})).toBeNull();
  });
});

describe('extractTwitterImagesFromSyndication', () => {
  it('returns the photo URLs from the `photos` array in order', () => {
    // Shape verified against the live endpoint for status 266031293945503744.
    const json = {
      text: 'Four more years. http://t.co/bAJE6Vom',
      photos: [
        { url: 'https://pbs.twimg.com/media/A7EiDWcCYAAZT1D.jpg', width: 800, height: 532 },
        { url: 'https://pbs.twimg.com/media/second.jpg', width: 800, height: 532 },
      ],
      mediaDetails: [{ type: 'photo', media_url_https: 'https://pbs.twimg.com/media/A7EiDWcCYAAZT1D.jpg' }],
    };
    expect(extractTwitterImagesFromSyndication(json)).toEqual([
      'https://pbs.twimg.com/media/A7EiDWcCYAAZT1D.jpg',
      'https://pbs.twimg.com/media/second.jpg',
    ]);
  });

  it('falls back to photo-typed mediaDetails when `photos` is absent', () => {
    const json = {
      mediaDetails: [
        { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/a.jpg' },
        { type: 'video', media_url_https: 'https://pbs.twimg.com/media/thumb.jpg' },
      ],
    };
    expect(extractTwitterImagesFromSyndication(json)).toEqual(['https://pbs.twimg.com/media/a.jpg']);
  });

  it('ignores malformed entries and returns [] for text-only tweets', () => {
    expect(extractTwitterImagesFromSyndication({ text: 'just text' })).toEqual([]);
    expect(extractTwitterImagesFromSyndication({ photos: [{}, { url: 42 }] })).toEqual([]);
    expect(extractTwitterImagesFromSyndication({})).toEqual([]);
  });
});

describe('pickAudioRenditionUrl', () => {
  const MASTER = [
    '#EXTM3U',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",URI="/x/pl/s0/subs.m3u8"',
    '#EXT-X-MEDIA:NAME="Audio",TYPE=AUDIO,GROUP-ID="audio-32000",AUTOSELECT=YES,URI="/x/pl/mp4a/32000/lo.m3u8"',
    '#EXT-X-MEDIA:NAME="Audio",TYPE=AUDIO,GROUP-ID="audio-64000",AUTOSELECT=YES,URI="/x/pl/mp4a/64000/hi.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=346676,AUDIO="audio-64000"',
    '/x/pl/avc1/640x360/v.m3u8',
  ].join('\n');

  it('returns the highest-bitrate audio rendition, resolved against the master URL', () => {
    expect(pickAudioRenditionUrl(MASTER, 'https://video.twimg.com/x/pl/master.m3u8?v=1')).toBe(
      'https://video.twimg.com/x/pl/mp4a/64000/hi.m3u8',
    );
  });

  it('returns null when the master has no separate audio rendition', () => {
    const novideo = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n/x/pl/avc1/640x360/v.m3u8';
    expect(pickAudioRenditionUrl(novideo, 'https://video.twimg.com/x/pl/master.m3u8')).toBeNull();
  });
});
