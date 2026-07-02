/**
 * Instagram's web client loads posts through persisted GraphQL queries that are
 * addressed by a numeric `doc_id`. The ids rotate every few weeks; when the
 * baked-in default goes stale we re-harvest the current one from Instagram's
 * own JS bundles (see `harvestQueryDescriptor`) and cache it.
 */
export declare const POST_QUERY_NAME = "PolarisPostRootQuery";
export declare const DEFAULT_DOC_ID = "27128499623469141";
export declare const DEFAULT_RELAY_PROVIDERS: string[];
export interface InstagramPost {
    shortcode: string;
}
export interface QueryDescriptor {
    docId: string;
    /** Relay provider module names the query depends on (e.g. "Foo.relayprovider"). */
    relayProviders: string[];
}
/**
 * Parse an instagram.com post URL into its shortcode.
 * Accepts `/p/<code>`, `/reel/<code>`, `/reels/<code>`, `/tv/<code>`, each with
 * an optional leading username segment. Returns null for non-post URLs —
 * including `/share/...` links, whose trailing token is an opaque share code
 * that only resolves to the real shortcode via redirect.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function parseInstagramUrl(url: string): InstagramPost | null;
/**
 * Relay passes each provider module to the query as an internal variable named
 * after the module with the dots stripped, e.g. "Foo.relayprovider" →
 * `__relay_internal__pv__Foorelayprovider`. The providers behind the post query
 * are boolean feature flags; `false` matches the logged-out client.
 * Exported separately so it can be unit-tested.
 */
export declare function buildRelayProviderVariables(providers: string[]): Record<string, boolean>;
/**
 * Find the current doc_id for `queryName` inside an Instagram JS bundle. Meta
 * registers each persisted query as
 * `__d("<name>_instagramRelayOperation",[],(function(...){...exports="<doc_id>"...`.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function extractDocIdFromBundle(bundleJs: string, queryName: string): string | null;
/**
 * Find the relay provider modules `queryName` depends on: they are listed in
 * the dependency array of the query's compiled `.graphql` artifact.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function extractRelayProvidersFromBundle(bundleJs: string, queryName: string): string[];
/**
 * Collect the JS bundle URLs referenced by an Instagram HTML page.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function extractScriptUrlsFromHtml(html: string): string[];
/**
 * Pull the standalone audio track's URL out of the DASH manifest Instagram
 * embeds in its media JSON. The audio AdaptationSet's BaseURL is a complete
 * audio-only MP4 (~60 kbps AAC) — the cheapest thing to download for
 * transcription. Returns null when the manifest has no audio set.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function pickDashAudioUrl(dashManifestXml: string): string | null;
export interface InstagramVideo {
    /** Direct CDN URL — the audio-only DASH track when available, else a progressive MP4. */
    videoUrl: string;
    /** True when `videoUrl` carries only the audio track. */
    isAudioOnly: boolean;
    title?: string | undefined;
}
/**
 * Select the transcription source from a `PolarisPostRootQuery` response.
 * Handles plain video posts and carousels (first video slide wins).
 * Returns null when the post exists but contains no video.
 * Exported separately so it can be unit-tested without network access.
 */
export declare function extractInstagramVideoFromWebInfo(json: unknown): InstagramVideo | null;
/**
 * Collect the photo URLs of a post that has no video: the post's own image
 * for single-photo posts, or one URL per photo slide for carousels. Each URL
 * is the highest-resolution candidate. Returns [] when the payload has no
 * photo media (or is not a post at all).
 * Exported separately so it can be unit-tested without network access.
 */
export declare function extractInstagramImagesFromWebInfo(json: unknown): string[];
/**
 * Resolve an Instagram post/reel URL to a directly-downloadable CDN URL using
 * the same persisted GraphQL query Instagram's logged-out web client runs — no
 * login, no cookies, no yt-dlp. Prefers the audio-only DASH track. Heals
 * itself when Instagram rotates the query's doc_id by re-harvesting the
 * current id from Instagram's JS bundles (cached across runs).
 */
export declare function resolveInstagramVideo(url: string, options?: {
    signal?: AbortSignal | undefined;
    timeoutMs?: number | undefined;
}): Promise<InstagramVideo>;
//# sourceMappingURL=instagram.d.ts.map