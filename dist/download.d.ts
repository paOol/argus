import type { Platform, ProgressEvent } from './types.js';
export interface DownloadOptions {
    ytDlpPath?: string | undefined;
    ffmpegPath?: string | undefined;
    cookiesFromBrowser?: string | undefined;
    cookiesFile?: string | undefined;
    timeoutMs?: number | undefined;
    signal?: AbortSignal | undefined;
    onProgress?: ((event: ProgressEvent) => void) | undefined;
}
export interface DownloadedMedia {
    filePath: string;
    title?: string | undefined;
}
/** Follow xhslink.com (and similar) short-link redirects manually so yt-dlp sees the canonical URL. */
export declare function resolveRedirects(url: string, signal?: AbortSignal): Promise<string>;
/** Stream a direct media URL to disk without buffering it in memory. */
export declare function streamToFile(url: string, destPath: string, options?: {
    signal?: AbortSignal | undefined;
    timeoutMs?: number | undefined;
    onProgress?: ((percent: number | undefined) => void) | undefined;
    headers?: Record<string, string>;
}): Promise<void>;
/**
 * XHS's new rednote.com domain serves the same notes, but yt-dlp's extractor
 * only matches the original domain — swap the host.
 */
export declare function rewriteRednoteHost(url: string): string;
/**
 * XHS's bot wall bounces some requests to /404 but embeds the canonical note
 * URL in a (sometimes nested) redirectPath query param — recover it.
 */
export declare function recoverXhsBotWallRedirect(target: string): string;
/** True when the URL points at a concrete XHS note rather than a feed/error page. */
export declare function isXhsNoteUrl(url: string): boolean;
/**
 * Download the media for a URL into `destDir`.
 * - Telegram: built-in embed-page extractor + direct CDN streaming (no yt-dlp involved).
 * - Reddit: built-in post-page extractor (with bot-check answering) + ffmpeg
 *   pulling only the audio track from the v.redd.it stream; yt-dlp is the
 *   fallback when `cookiesFromBrowser` is provided.
 * - Twitter/X: built-in syndication-endpoint extractor + ffmpeg pulling only
 *   the audio rendition; yt-dlp is the fallback when `cookiesFromBrowser` is
 *   provided (for protected/login-gated tweets).
 * - Xiaohongshu short links: redirect-resolved first, then handed to yt-dlp.
 * - Everything else: yt-dlp, requesting audio-only formats when the site offers them.
 */
export declare function downloadMedia(url: string, platform: Platform, destDir: string, options?: DownloadOptions): Promise<DownloadedMedia>;
//# sourceMappingURL=download.d.ts.map