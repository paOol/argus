export interface RedditChallenge {
    /** Value for the form's `solution` field (the page's seed string doubled). */
    solution: string;
    token: string;
}
/**
 * Reddit fronts anonymous page loads with a lightweight JS check: the page
 * runs `(async e=>e+e)("<seed>")` and resubmits the URL with the result plus
 * a hidden token. Returns null when `html` is not a challenge page.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function parseRedditChallenge(html: string): RedditChallenge | null;
/** Build the challenge-answer URL: the original URL plus the form fields as query params. */
export declare function buildChallengeAnswerUrl(pageUrl: string, challenge: RedditChallenge): string;
export interface RedditVideo {
    /** Signed v.redd.it stream URL (HLS playlist or direct MP4) — expires after a while. */
    videoUrl: string;
    title?: string | undefined;
}
/**
 * Extract the post's own video stream URL from a Reddit post page.
 * Promoted (ad) players interleaved into the page are skipped.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function extractRedditVideoFromPostHtml(html: string): RedditVideo | null;
/**
 * Extract the post's image URLs from a Reddit post page, in display order.
 * Single-image posts carry their full-resolution i.redd.it URL in the
 * <shreddit-post> tag's content-href; galleries render each slide as a
 * lightbox <img> whose srcset candidates are signed preview.redd.it URLs
 * (the signature only covers the exact query params, so URLs are kept
 * verbatim). Returns [] when the post has no Reddit-hosted images.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function extractRedditImagesFromPostHtml(html: string): string[];
/**
 * Resolve a Reddit post URL (canonical, share, or redd.it short link) to its
 * direct video stream URL by fetching the post page and answering Reddit's JS
 * challenge when one is served — no credentials and no Reddit API involved.
 */
export declare function resolveRedditVideo(url: string, options?: {
    signal?: AbortSignal | undefined;
    timeoutMs?: number | undefined;
}): Promise<RedditVideo>;
//# sourceMappingURL=reddit.d.ts.map