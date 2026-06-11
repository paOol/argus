import { DownloadError, UnsupportedUrlError } from './errors.js';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
/**
 * Parse a public Telegram post URL into channel + message id.
 * Accepts t.me/<channel>/<id>, t.me/s/<channel>/<id>, telegram.me variants,
 * and ?single / ?embed query suffixes.
 *
 * @throws {UnsupportedUrlError} for private (`t.me/c/...`) or non-post links.
 */
export function parseTelegramUrl(url) {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    // Strip the web-preview prefix: t.me/s/<channel>/<id>
    if (segments[0] === 's')
        segments.shift();
    if (segments[0] === 'c') {
        throw new UnsupportedUrlError(url, 'private Telegram links (t.me/c/...) have no public embed; download the video with a Telegram client and use transcribeFile()');
    }
    const [channel, messageId] = segments;
    if (!channel || !messageId || !/^\d+$/.test(messageId)) {
        throw new UnsupportedUrlError(url, 'expected a Telegram post link like https://t.me/<channel>/<id>');
    }
    return {
        channel,
        messageId,
        embedUrl: `https://t.me/${channel}/${messageId}?embed=1&mode=tme`,
    };
}
function decodeHtmlEntities(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'");
}
/**
 * Extract the direct CDN video URL from a Telegram embed page's HTML.
 * Exported separately so it can be unit-tested without network access.
 */
export function extractVideoUrlFromEmbedHtml(html) {
    // The embed page renders the post's video as <video src="https://cdn-….telesco.pe/…"> (or a tg CDN host).
    const match = html.match(/<video[^>]+src="([^"]+)"/i) ?? html.match(/<video[^>]+src='([^']+)'/i);
    if (!match?.[1])
        return null;
    const src = decodeHtmlEntities(match[1]);
    return src.startsWith('http') ? src : null;
}
/**
 * Resolve a public t.me post link to its direct video URL by fetching the
 * embed page — plain HTTPS, no Telegram API, no credentials.
 */
export async function resolveTelegramVideo(url, options = {}) {
    const post = parseTelegramUrl(url);
    const signals = [];
    if (options.signal)
        signals.push(options.signal);
    if (options.timeoutMs && options.timeoutMs > 0)
        signals.push(AbortSignal.timeout(options.timeoutMs));
    const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined;
    let response;
    try {
        response = await fetch(post.embedUrl, {
            headers: { 'user-agent': BROWSER_UA, accept: 'text/html' },
            ...(signal ? { signal } : {}),
        });
    }
    catch (cause) {
        throw new DownloadError(`Failed to fetch Telegram embed page ${post.embedUrl}`, { cause });
    }
    if (!response.ok) {
        throw new DownloadError(`Telegram embed page returned HTTP ${response.status} for ${post.embedUrl}`);
    }
    const html = await response.text();
    const videoUrl = extractVideoUrlFromEmbedHtml(html);
    if (!videoUrl) {
        throw new DownloadError(`No video found in Telegram post https://t.me/${post.channel}/${post.messageId}. ` +
            'The post may not contain a video, the channel may be private or restricted, ' +
            'or the video may be too large for Telegram to serve via web embed.');
    }
    return { videoUrl, post };
}
//# sourceMappingURL=telegram.js.map