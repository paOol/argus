import { UnsupportedUrlError } from './errors.js';
import type { Platform } from './types.js';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am']);

// Xiaohongshu is migrating to the rednote.com domain; both serve the same notes.
// Share links come from two short-link domains: the older xhslink.com/a/... and
// the current app's xhslink.cn/o/... — both redirect to the same note pages.
const XIAOHONGSHU_HOSTS = new Set([
  'xiaohongshu.com',
  'www.xiaohongshu.com',
  'xhslink.com',
  'www.xhslink.com',
  'xhslink.cn',
  'www.xhslink.cn',
  'rednote.com',
  'www.rednote.com',
]);

/**
 * True for XHS share-link hosts, whose URLs must be redirect-resolved before
 * yt-dlp sees them — its extractor only matches canonical note URLs.
 */
export function isXhsShortLinkHost(hostname: string): boolean {
  return /(^|\.)xhslink\.(com|cn)$/i.test(hostname);
}

const TELEGRAM_HOSTS = new Set(['t.me', 'telegram.me', 'www.t.me', 'www.telegram.me']);

const REDDIT_HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'new.reddit.com',
  'np.reddit.com',
  'sh.reddit.com',
  'm.reddit.com',
  'redd.it',
  'v.redd.it',
]);

// x.com is the current host; twitter.com still serves the same status URLs.
const TWITTER_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'mobile.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
]);

/**
 * Detect which platform a URL belongs to.
 * Unknown hosts return `generic` — they are still attempted via yt-dlp,
 * which supports most video sites.
 *
 * @throws {UnsupportedUrlError} if the string is not an http(s) URL at all.
 */
export function detectPlatform(url: string): Platform {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsupportedUrlError(url, 'not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsupportedUrlError(url, `unsupported protocol "${parsed.protocol}"`);
  }

  const host = parsed.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) return 'youtube';
  if (INSTAGRAM_HOSTS.has(host)) return 'instagram';
  if (XIAOHONGSHU_HOSTS.has(host)) return 'xiaohongshu';
  if (TELEGRAM_HOSTS.has(host)) return 'telegram';
  if (REDDIT_HOSTS.has(host)) return 'reddit';
  if (TWITTER_HOSTS.has(host)) return 'twitter';

  return 'generic';
}
