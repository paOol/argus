import { UnsupportedUrlError } from './errors.js';
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
const XIAOHONGSHU_HOSTS = new Set([
    'xiaohongshu.com',
    'www.xiaohongshu.com',
    'xhslink.com',
    'rednote.com',
    'www.rednote.com',
]);
const TELEGRAM_HOSTS = new Set(['t.me', 'telegram.me', 'www.t.me', 'www.telegram.me']);
/**
 * Detect which platform a URL belongs to.
 * Unknown hosts return `generic` — they are still attempted via yt-dlp,
 * which supports most video sites.
 *
 * @throws {UnsupportedUrlError} if the string is not an http(s) URL at all.
 */
export function detectPlatform(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new UnsupportedUrlError(url, 'not a valid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new UnsupportedUrlError(url, `unsupported protocol "${parsed.protocol}"`);
    }
    const host = parsed.hostname.toLowerCase();
    if (YOUTUBE_HOSTS.has(host))
        return 'youtube';
    if (INSTAGRAM_HOSTS.has(host))
        return 'instagram';
    if (XIAOHONGSHU_HOSTS.has(host))
        return 'xiaohongshu';
    if (TELEGRAM_HOSTS.has(host))
        return 'telegram';
    return 'generic';
}
//# sourceMappingURL=platform.js.map