import { describe, expect, it } from 'vitest';

import { isXhsNoteUrl, recoverXhsBotWallRedirect, rewriteRednoteHost } from '../src/download.js';

describe('rewriteRednoteHost', () => {
  it('rewrites rednote.com to www.xiaohongshu.com, preserving path and token', () => {
    expect(
      rewriteRednoteHost('https://www.rednote.com/explore/69ce30d3000000002100791c?xsec_token=ABQ='),
    ).toBe('https://www.xiaohongshu.com/explore/69ce30d3000000002100791c?xsec_token=ABQ=');
    expect(rewriteRednoteHost('https://rednote.com/explore/abc123')).toBe(
      'https://www.xiaohongshu.com/explore/abc123',
    );
  });

  it('leaves other hosts untouched', () => {
    const url = 'https://www.xiaohongshu.com/explore/abc?xsec_token=x';
    expect(rewriteRednoteHost(url)).toBe(url);
    expect(rewriteRednoteHost('http://xhslink.com/o/abc')).toBe('http://xhslink.com/o/abc');
  });
});

describe('recoverXhsBotWallRedirect', () => {
  it('recovers the note URL nested inside the 404 page redirectPath param', () => {
    const bounced =
      'https://www.xiaohongshu.com/404?source=/404/sec_xyz?redirectPath=' +
      encodeURIComponent('https://www.xiaohongshu.com/discovery/item/690c8fb0000000000303b5b2?xsec_token=CB7=') +
      '&error_code=300031';
    expect(recoverXhsBotWallRedirect(bounced)).toBe(
      'https://www.xiaohongshu.com/discovery/item/690c8fb0000000000303b5b2?xsec_token=CB7=',
    );
  });

  it('returns non-404 URLs unchanged', () => {
    const url = 'https://www.xiaohongshu.com/explore/abc123';
    expect(recoverXhsBotWallRedirect(url)).toBe(url);
  });

  it('returns the 404 URL unchanged when no redirectPath is present', () => {
    const url = 'https://www.xiaohongshu.com/404?error_code=300031';
    expect(recoverXhsBotWallRedirect(url)).toBe(url);
  });
});

describe('isXhsNoteUrl', () => {
  it('accepts explore and discovery note URLs', () => {
    expect(isXhsNoteUrl('https://www.xiaohongshu.com/explore/690c8fb0000000000303b5b2')).toBe(true);
    expect(isXhsNoteUrl('https://www.xiaohongshu.com/discovery/item/690c8fb0000000000303b5b2?x=1')).toBe(true);
  });

  it('rejects feed and error pages', () => {
    expect(isXhsNoteUrl('https://www.xiaohongshu.com/explore')).toBe(false);
    expect(isXhsNoteUrl('https://www.xiaohongshu.com/404?error_code=300031')).toBe(false);
  });
});
