import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DownloadError, NoVideoError } from './errors.js';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
/**
 * Instagram's web client loads posts through persisted GraphQL queries that are
 * addressed by a numeric `doc_id`. The ids rotate every few weeks; when the
 * baked-in default goes stale we re-harvest the current one from Instagram's
 * own JS bundles (see `harvestQueryDescriptor`) and cache it.
 */
export const POST_QUERY_NAME = 'PolarisPostRootQuery';
export const DEFAULT_DOC_ID = '27128499623469141';
export const DEFAULT_RELAY_PROVIDERS = ['PolarisAIGMMediaWebLabelEnabled.relayprovider'];
const GRAPHQL_ENDPOINT = 'https://www.instagram.com/api/graphql';
const IG_APP_ID = '936619743392459';
/**
 * Parse an instagram.com post URL into its shortcode.
 * Accepts `/p/<code>`, `/reel/<code>`, `/reels/<code>`, `/tv/<code>`, each with
 * an optional leading username segment. Returns null for non-post URLs —
 * including `/share/...` links, whose trailing token is an opaque share code
 * that only resolves to the real shortcode via redirect.
 * Exported separately so it can be unit-tested without network access.
 */
export function parseInstagramUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return null;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0] === 'share')
        return null;
    const kinds = new Set(['p', 'reel', 'reels', 'tv']);
    // `/p/<code>` or `/<username>/p/<code>`.
    for (const at of [0, 1]) {
        const kind = segments[at];
        const code = segments[at + 1];
        if (kind && kinds.has(kind) && code && /^[A-Za-z0-9_-]{5,}$/.test(code)) {
            return { shortcode: code };
        }
    }
    return null;
}
/**
 * Relay passes each provider module to the query as an internal variable named
 * after the module with the dots stripped, e.g. "Foo.relayprovider" →
 * `__relay_internal__pv__Foorelayprovider`. The providers behind the post query
 * are boolean feature flags; `false` matches the logged-out client.
 * Exported separately so it can be unit-tested.
 */
export function buildRelayProviderVariables(providers) {
    const variables = {};
    for (const name of providers) {
        variables[`__relay_internal__pv__${name.replace(/\./g, '')}`] = false;
    }
    return variables;
}
/**
 * Find the current doc_id for `queryName` inside an Instagram JS bundle. Meta
 * registers each persisted query as
 * `__d("<name>_instagramRelayOperation",[],(function(...){...exports="<doc_id>"...`.
 * Exported separately so it can be unit-tested without network access.
 */
export function extractDocIdFromBundle(bundleJs, queryName) {
    const registration = new RegExp(`__d\\("${queryName}_instagramRelayOperation",\\[\\],\\(function\\([^)]*\\)\\{[^}]*?exports="(\\d+)"`);
    return bundleJs.match(registration)?.[1] ?? null;
}
/**
 * Find the relay provider modules `queryName` depends on: they are listed in
 * the dependency array of the query's compiled `.graphql` artifact.
 * Exported separately so it can be unit-tested without network access.
 */
export function extractRelayProvidersFromBundle(bundleJs, queryName) {
    const deps = bundleJs.match(new RegExp(`__d\\("${queryName}\\.graphql",\\[([^\\]]*)\\]`))?.[1];
    if (!deps)
        return [];
    return [...deps.matchAll(/"([^"]+\.relayprovider)"/g)].map((m) => m[1]);
}
/**
 * Collect the JS bundle URLs referenced by an Instagram HTML page.
 * Exported separately so it can be unit-tested without network access.
 */
export function extractScriptUrlsFromHtml(html) {
    const urls = html.match(/https:\/\/static\.cdninstagram\.com\/rsrc\.php\/[^\s"'<>]+\.js/g) ?? [];
    return [...new Set(urls)];
}
function decodeXmlEntities(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&#x27;/gi, "'");
}
/**
 * Pull the standalone audio track's URL out of the DASH manifest Instagram
 * embeds in its media JSON. The audio AdaptationSet's BaseURL is a complete
 * audio-only MP4 (~60 kbps AAC) — the cheapest thing to download for
 * transcription. Returns null when the manifest has no audio set.
 * Exported separately so it can be unit-tested without network access.
 */
export function pickDashAudioUrl(dashManifestXml) {
    const audioSet = dashManifestXml.match(/<AdaptationSet[^>]*contentType="audio"[^>]*>[\s\S]*?<\/AdaptationSet>/)?.[0];
    const base = audioSet?.match(/<BaseURL>([^<]+)<\/BaseURL>/)?.[1];
    if (!base)
        return null;
    const url = decodeXmlEntities(base);
    return url.startsWith('http') ? url : null;
}
const MEDIA_TYPE_PHOTO = 1;
const MEDIA_TYPE_VIDEO = 2;
function pickVideoFromItem(item) {
    if (item.video_dash_manifest) {
        const audioUrl = pickDashAudioUrl(item.video_dash_manifest);
        if (audioUrl)
            return { videoUrl: audioUrl, isAudioOnly: true };
    }
    // Smallest rendition — quality is irrelevant for transcription.
    const versions = (item.video_versions ?? [])
        .filter((v) => typeof v.url === 'string' && v.url.startsWith('http'))
        .sort((a, b) => (a.width ?? 0) * (a.height ?? 0) - (b.width ?? 0) * (b.height ?? 0));
    const smallest = versions[0];
    return smallest ? { videoUrl: smallest.url, isAudioOnly: false } : null;
}
/**
 * Select the transcription source from a `PolarisPostRootQuery` response.
 * Handles plain video posts and carousels (first video slide wins).
 * Returns null when the post exists but contains no video.
 * Exported separately so it can be unit-tested without network access.
 */
export function extractInstagramVideoFromWebInfo(json) {
    const root = json;
    const item = root?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];
    if (!item)
        return null;
    const candidates = [item, ...(item.carousel_media ?? [])];
    for (const candidate of candidates) {
        if (candidate.media_type !== MEDIA_TYPE_VIDEO && candidate !== item)
            continue;
        const video = pickVideoFromItem(candidate);
        if (video) {
            const caption = item.caption?.text;
            const title = typeof caption === 'string' ? caption.replace(/\s+/g, ' ').trim() || undefined : undefined;
            return { ...video, ...(title ? { title } : {}) };
        }
    }
    return null;
}
/**
 * Collect the photo URLs of a post that has no video: the post's own image
 * for single-photo posts, or one URL per photo slide for carousels. Each URL
 * is the highest-resolution candidate. Returns [] when the payload has no
 * photo media (or is not a post at all).
 * Exported separately so it can be unit-tested without network access.
 */
export function extractInstagramImagesFromWebInfo(json) {
    const root = json;
    const item = root?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];
    if (!item)
        return [];
    const slides = item.carousel_media?.length ? item.carousel_media : [item];
    const urls = [];
    for (const slide of slides) {
        if (slide.media_type !== MEDIA_TYPE_PHOTO)
            continue;
        // Candidates are ordered largest-first.
        const url = slide.image_versions2?.candidates?.[0]?.url;
        if (typeof url === 'string' && url.startsWith('http'))
            urls.push(url);
    }
    return urls;
}
function cacheFilePath() {
    const cacheHome = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
    return join(cacheHome, 'argus', 'instagram-query.json');
}
let memoryDescriptor = null;
async function loadCachedDescriptor() {
    if (memoryDescriptor)
        return memoryDescriptor;
    try {
        const parsed = JSON.parse(await readFile(cacheFilePath(), 'utf8'));
        if (typeof parsed?.docId === 'string' && Array.isArray(parsed?.relayProviders)) {
            memoryDescriptor = { docId: parsed.docId, relayProviders: parsed.relayProviders };
            return memoryDescriptor;
        }
    }
    catch {
        // No cache yet (or unreadable) — fall through to the default descriptor.
    }
    return null;
}
async function saveCachedDescriptor(descriptor) {
    memoryDescriptor = descriptor;
    try {
        const path = cacheFilePath();
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify({ ...descriptor, harvestedAt: new Date().toISOString() }));
    }
    catch {
        // Best-effort cache; the in-memory copy still serves this process.
    }
}
async function fetchText(url, accept, signal) {
    let response;
    try {
        response = await fetch(url, {
            headers: { 'user-agent': BROWSER_UA, accept },
            ...(signal ? { signal } : {}),
        });
    }
    catch (cause) {
        throw new DownloadError(`Failed to fetch ${url}`, { cause });
    }
    if (!response.ok) {
        await response.body?.cancel().catch(() => { });
        throw new DownloadError(`Instagram returned HTTP ${response.status} for ${url}`);
    }
    return response.text();
}
/**
 * Recover the current post-query descriptor from Instagram's own JS bundles:
 * fetch the (logged-out accessible) embed page, then scan the bundles it
 * references for the query's relay registration. This is what keeps the
 * extractor working when Instagram rotates its persisted query ids.
 */
async function harvestQueryDescriptor(shortcode, signal) {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const html = await fetchText(embedUrl, 'text/html', signal);
    const scriptUrls = extractScriptUrlsFromHtml(html);
    if (scriptUrls.length === 0) {
        throw new DownloadError(`Could not find any script bundles on ${embedUrl} to recover Instagram's current query id from.`);
    }
    const bundles = await Promise.all(scriptUrls.map((u) => fetchText(u, '*/*', signal).catch(() => '')));
    // The registration (doc_id) and the compiled .graphql artifact (provider
    // list) usually live in different bundles — scan for each independently.
    let docId = null;
    let relayProviders = null;
    for (const bundle of bundles) {
        docId ??= extractDocIdFromBundle(bundle, POST_QUERY_NAME);
        const providers = extractRelayProvidersFromBundle(bundle, POST_QUERY_NAME);
        if (providers.length > 0)
            relayProviders ??= providers;
    }
    if (docId)
        return { docId, relayProviders: relayProviders ?? DEFAULT_RELAY_PROVIDERS };
    throw new DownloadError(`Instagram's ${POST_QUERY_NAME} query was not found in any of the ${scriptUrls.length} script bundles ` +
        `referenced by ${embedUrl}. Instagram may have restructured its web client; ` +
        'try updating argus, or pass --cookies-from-browser to go through yt-dlp with your account.');
}
/**
 * Run the persisted post query for a shortcode. No login and no cookies: the
 * endpoint accepts any `lsd` token as long as the request carries same-origin
 * `Sec-Fetch-*`/`Origin` headers and the web app id.
 */
async function queryPost(shortcode, descriptor, signal) {
    const lsd = 'argus';
    const body = new URLSearchParams({
        variables: JSON.stringify({
            shortcode,
            ...buildRelayProviderVariables(descriptor.relayProviders),
        }),
        doc_id: descriptor.docId,
        lsd,
    });
    let response;
    try {
        response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: {
                'user-agent': BROWSER_UA,
                'x-ig-app-id': IG_APP_ID,
                'x-fb-lsd': lsd,
                origin: 'https://www.instagram.com',
                referer: `https://www.instagram.com/p/${shortcode}/`,
                'sec-fetch-site': 'same-origin',
                'sec-fetch-mode': 'cors',
                'sec-fetch-dest': 'empty',
                'content-type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
            ...(signal ? { signal } : {}),
        });
    }
    catch (cause) {
        throw new DownloadError(`Failed to query Instagram for post ${shortcode}`, { cause });
    }
    if (!response.ok) {
        await response.body?.cancel().catch(() => { });
        throw new DownloadError(`Instagram returned HTTP ${response.status} for post ${shortcode}`);
    }
    const text = await response.text();
    try {
        return JSON.parse(text);
    }
    catch {
        // The endpoint serves an HTML shell instead of JSON when it rejects the
        // request shape — treated like a stale descriptor by the caller.
        return null;
    }
}
/** Follow redirects (e.g. instagram.com/share/... links) to the canonical post URL. */
async function resolveShareRedirect(url, signal) {
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
        let response;
        try {
            response = await fetch(current, {
                redirect: 'manual',
                headers: { 'user-agent': BROWSER_UA, accept: 'text/html' },
                ...(signal ? { signal } : {}),
            });
        }
        catch (cause) {
            throw new DownloadError(`Failed to resolve Instagram share link ${current}`, { cause });
        }
        await response.body?.cancel().catch(() => { });
        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && location) {
            current = new URL(location, current).toString();
            continue;
        }
        return current;
    }
    return current;
}
/**
 * Resolve an Instagram post/reel URL to a directly-downloadable CDN URL using
 * the same persisted GraphQL query Instagram's logged-out web client runs — no
 * login, no cookies, no yt-dlp. Prefers the audio-only DASH track. Heals
 * itself when Instagram rotates the query's doc_id by re-harvesting the
 * current id from Instagram's JS bundles (cached across runs).
 */
export async function resolveInstagramVideo(url, options = {}) {
    const signals = [];
    if (options.signal)
        signals.push(options.signal);
    if (options.timeoutMs && options.timeoutMs > 0)
        signals.push(AbortSignal.timeout(options.timeoutMs));
    const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined;
    let post = parseInstagramUrl(url);
    if (!post) {
        post = parseInstagramUrl(await resolveShareRedirect(url, signal));
    }
    if (!post) {
        throw new DownloadError(`Not an Instagram post URL: ${url}. Expected something like https://www.instagram.com/reel/<code>/ ` +
            '(stories and profile links are not supported).');
    }
    const cached = await loadCachedDescriptor();
    const defaults = { docId: DEFAULT_DOC_ID, relayProviders: DEFAULT_RELAY_PROVIDERS };
    const tried = new Set();
    let postWithoutVideo;
    const attempt = async (descriptor) => {
        if (tried.has(descriptor.docId))
            return null;
        tried.add(descriptor.docId);
        const json = await queryPost(post.shortcode, descriptor, signal);
        const video = extractInstagramVideoFromWebInfo(json);
        if (video)
            return video;
        // Distinguish "query worked, post has no video" from "query rejected".
        const items = json?.data?.xdt_api__v1__media__shortcode__web_info?.items;
        if (Array.isArray(items) && items.length > 0)
            postWithoutVideo = json;
        return null;
    };
    for (const descriptor of cached ? [cached, defaults] : [defaults]) {
        const video = await attempt(descriptor);
        if (video)
            return video;
        if (postWithoutVideo)
            break;
    }
    if (!postWithoutVideo) {
        // Every known descriptor failed — likely a rotated doc_id. Harvest the
        // current one from Instagram's bundles and retry once.
        const fresh = await harvestQueryDescriptor(post.shortcode, signal);
        const video = await attempt(fresh);
        if (video) {
            await saveCachedDescriptor(fresh);
            return video;
        }
    }
    if (postWithoutVideo) {
        const imageUrls = extractInstagramImagesFromWebInfo(postWithoutVideo);
        throw new NoVideoError(imageUrls.length > 0
            ? `Instagram post ${url} is a photo post — there is no video to transcribe. ` +
                `The image URL${imageUrls.length > 1 ? 's are' : ' is'} attached to this error.`
            : `No video found in Instagram post ${url}.`, imageUrls);
    }
    throw new DownloadError(`Instagram post ${url} is unavailable anonymously (deleted, private, or login-gated). ` +
        'Pass --cookies-from-browser (or cookiesFile) to fetch it via yt-dlp with your account.');
}
//# sourceMappingURL=instagram.js.map