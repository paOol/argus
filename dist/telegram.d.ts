export interface TelegramPost {
    channel: string;
    messageId: string;
    embedUrl: string;
}
/**
 * Parse a public Telegram post URL into channel + message id.
 * Accepts t.me/<channel>/<id>, t.me/s/<channel>/<id>, telegram.me variants,
 * and ?single / ?embed query suffixes.
 *
 * @throws {UnsupportedUrlError} for private (`t.me/c/...`) or non-post links.
 */
export declare function parseTelegramUrl(url: string): TelegramPost;
/**
 * Extract the direct CDN video URL from a Telegram embed page's HTML.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function extractVideoUrlFromEmbedHtml(html: string): string | null;
/**
 * Extract the photo URLs from a Telegram embed page's HTML, in display order.
 * Each photo renders as <a class="tgme_widget_message_photo_wrap ..."
 * style="...background-image:url('https://cdnN.telesco.pe/file/...')">, one
 * element per photo for albums. Returns [] for photo-less posts.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function extractPhotoUrlsFromEmbedHtml(html: string): string[];
/**
 * Resolve a public t.me post link to its direct video URL by fetching the
 * embed page — plain HTTPS, no Telegram API, no credentials.
 */
export declare function resolveTelegramVideo(url: string, options?: {
    signal?: AbortSignal | undefined;
    timeoutMs?: number | undefined;
}): Promise<{
    videoUrl: string;
    post: TelegramPost;
}>;
//# sourceMappingURL=telegram.d.ts.map