export interface TwitterStatus {
    /** Numeric tweet (status) id. */
    id: string;
    /** Author handle, when the URL carries one (absent for /i/status/<id> links). */
    screenName?: string | undefined;
}
/**
 * Parse an x.com / twitter.com status URL into its tweet id (and author handle).
 * Accepts `/<user>/status/<id>`, `/i/web/status/<id>`, and `/i/status/<id>`.
 * Returns null for non-status URLs (profiles, search, etc.).
 * Exported separately so it can be unit-tested without network access.
 */
export declare function parseTwitterStatusUrl(url: string): TwitterStatus | null;
/**
 * Compute the `token` the syndication endpoint requires. It is derived purely
 * from the tweet id: `((id / 1e15) * π)` rendered in base 36 with zeros and the
 * decimal point stripped — the same transform Twitter's embed script uses.
 * Exported separately so it can be unit-tested.
 */
export declare function buildSyndicationToken(id: string): string;
export interface TwitterVideo {
    /** Best stream URL — an HLS master playlist when available, else a progressive MP4. */
    videoUrl: string;
    /** True when `videoUrl` is an HLS (`.m3u8`) playlist rather than a direct file. */
    isHls: boolean;
    title?: string | undefined;
}
/**
 * Select the best video stream from a syndication `tweet-result` payload.
 * Prefers the HLS master playlist (it exposes a separate audio rendition we can
 * pull alone); otherwise falls back to the highest-bitrate progressive MP4.
 * Returns null when the tweet has no video.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function extractTwitterVideoFromSyndication(json: unknown): TwitterVideo | null;
/**
 * From an HLS master playlist, return the URL of the highest-bitrate standalone
 * audio rendition (`#EXT-X-MEDIA:TYPE=AUDIO`). This lets ffmpeg fetch only the
 * audio segments instead of the full video. Returns null when the master has no
 * separate audio rendition (rare for Twitter `amplify_video`).
 * Exported separately so it can be unit-tested without network access.
 */
export declare function pickAudioRenditionUrl(masterM3u8: string, baseUrl: string): string | null;
/**
 * Resolve a tweet URL to a directly-downloadable audio/video stream URL using
 * Twitter's public syndication endpoint — no login, no API keys, no yt-dlp.
 * When the tweet's video is served over HLS, the returned URL points at the
 * audio-only rendition so the download stays small.
 */
export declare function resolveTwitterVideo(url: string, options?: {
    signal?: AbortSignal | undefined;
    timeoutMs?: number | undefined;
}): Promise<TwitterVideo>;
//# sourceMappingURL=twitter.d.ts.map