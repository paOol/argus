import type { Platform } from './types.js';
/**
 * Detect which platform a URL belongs to.
 * Unknown hosts return `generic` — they are still attempted via yt-dlp,
 * which supports most video sites.
 *
 * @throws {UnsupportedUrlError} if the string is not an http(s) URL at all.
 */
export declare function detectPlatform(url: string): Platform;
//# sourceMappingURL=platform.d.ts.map