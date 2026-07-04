import { describe, expect, it } from 'vitest';

import { UnsupportedUrlError } from '../src/errors.js';
import {
  extractPhotoUrlsFromEmbedHtml,
  extractVideoUrlFromEmbedHtml,
  parseTelegramUrl,
} from '../src/telegram.js';

describe('parseTelegramUrl', () => {
  it('parses a standard post link', () => {
    expect(parseTelegramUrl('https://t.me/durov/123')).toEqual({
      channel: 'durov',
      messageId: '123',
      embedUrl: 'https://t.me/durov/123?embed=1&mode=tme',
    });
  });

  it('parses web-preview links (t.me/s/...)', () => {
    expect(parseTelegramUrl('https://t.me/s/durov/123').channel).toBe('durov');
  });

  it('ignores query parameters like ?single', () => {
    expect(parseTelegramUrl('https://t.me/durov/123?single').messageId).toBe('123');
  });

  it('accepts telegram.me hosts', () => {
    expect(parseTelegramUrl('https://telegram.me/durov/9').messageId).toBe('9');
  });

  it('rejects private channel links', () => {
    expect(() => parseTelegramUrl('https://t.me/c/1234567/89')).toThrow(UnsupportedUrlError);
  });

  it('rejects profile links without a message id', () => {
    expect(() => parseTelegramUrl('https://t.me/durov')).toThrow(UnsupportedUrlError);
  });

  it('rejects non-numeric message ids', () => {
    expect(() => parseTelegramUrl('https://t.me/durov/abc')).toThrow(UnsupportedUrlError);
  });
});

describe('extractVideoUrlFromEmbedHtml', () => {
  it('extracts the video src from an embed page', () => {
    const html = `
      <div class="tgme_widget_message_video_wrap">
        <video src="https://cdn4.telesco.pe/file/abc123.mp4?token=x&amp;sig=y" class="tgme_widget_message_video" muted></video>
      </div>`;
    expect(extractVideoUrlFromEmbedHtml(html)).toBe('https://cdn4.telesco.pe/file/abc123.mp4?token=x&sig=y');
  });

  it('handles single-quoted attributes', () => {
    const html = `<video class='x' src='https://cdn4.telesco.pe/file/v.mp4'></video>`;
    expect(extractVideoUrlFromEmbedHtml(html)).toBe('https://cdn4.telesco.pe/file/v.mp4');
  });

  it('returns null when there is no video', () => {
    expect(extractVideoUrlFromEmbedHtml('<div class="tgme_widget_message_photo"></div>')).toBeNull();
  });

  it('returns null for non-http sources', () => {
    expect(extractVideoUrlFromEmbedHtml('<video src="blob:xyz"></video>')).toBeNull();
  });
});

describe('extractPhotoUrlsFromEmbedHtml', () => {
  // Markup mirrors a real embed page of a two-photo album (t.me/durov/510).
  const ALBUM_PAGE = `
    <a class="tgme_widget_message_photo_wrap grouped_media_wrap blured js-message_photo"
       style="left:0px;top:0px;width:225px;background-image:url('https://cdn4.telesco.pe/file/first.jpg')"
       data-ratio="0.7225" href="https://t.me/durov/510?single"></a>
    <a class="tgme_widget_message_photo_wrap grouped_media_wrap blured js-message_photo"
       style="left:227px;top:0px;width:226px;background-image:url('https://cdn4.telesco.pe/file/second.jpg')"
       data-ratio="0.7225" href="https://t.me/durov/511?single"></a>`;

  it('returns one URL per photo wrap, in display order', () => {
    expect(extractPhotoUrlsFromEmbedHtml(ALBUM_PAGE)).toEqual([
      'https://cdn4.telesco.pe/file/first.jpg',
      'https://cdn4.telesco.pe/file/second.jpg',
    ]);
  });

  it('decodes HTML entities in the background-image URL', () => {
    const html = `<a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn4.telesco.pe/file/a.jpg?t=1&amp;s=2')">`;
    expect(extractPhotoUrlsFromEmbedHtml(html)).toEqual(['https://cdn4.telesco.pe/file/a.jpg?t=1&s=2']);
  });

  it('returns [] for pages without photo wraps', () => {
    expect(extractPhotoUrlsFromEmbedHtml('<video src="https://cdn4.telesco.pe/file/v.mp4"></video>')).toEqual([]);
    expect(extractPhotoUrlsFromEmbedHtml('')).toEqual([]);
  });
});
