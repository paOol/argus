import { DownloadError, NoVideoError } from './errors.js';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

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
export function parseRedditChallenge(html: string): RedditChallenge | null {
  if (!html.includes('js_challenge')) return null;
  const seed = html.match(/\(async e=>e\+e\)\("([^"]+)"\)/)?.[1];
  const token = html.match(/name="token"\s+value="([^"]+)"/)?.[1];
  if (!seed || !token) return null;
  return { solution: seed + seed, token };
}

/** Build the challenge-answer URL: the original URL plus the form fields as query params. */
export function buildChallengeAnswerUrl(pageUrl: string, challenge: RedditChallenge): string {
  const url = new URL(pageUrl);
  url.searchParams.set('solution', challenge.solution);
  url.searchParams.set('js_challenge', '1');
  url.searchParams.set('token', challenge.token);
  url.searchParams.set('jsc_orig_r', '');
  return url.toString();
}

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
export function extractRedditVideoFromPostHtml(html: string): RedditVideo | null {
  // Image and gallery posts sometimes carry a player too, for an
  // auto-generated video rendition (v.redd.it/link/<post>/asset/...) — the
  // post's declared type wins over the presence of a player.
  const postType = html.match(/<shreddit-post\b[^>]*/)?.[0]?.match(/\bpost-type="([^"]*)"/)?.[1];
  if (postType === 'image' || postType === 'gallery') return null;

  for (const tag of html.match(/<shreddit-player(?:-\d+)?\b[^>]*/g) ?? []) {
    if (/\bpost-promoted\b/.test(tag)) continue;
    const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
    if (!src) continue;
    const videoUrl = decodeHtmlEntities(src);
    let host: string;
    try {
      host = new URL(videoUrl).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (host !== 'v.redd.it' && host !== 'packaged-media.redd.it') continue;
    if (!/HLSPlaylist\.m3u8|\.mp4/i.test(videoUrl)) continue;

    // <shreddit-title title="Post title : r/subreddit">
    const rawTitle = html.match(/<shreddit-title\s+title="([^"]*)"/)?.[1];
    const title = rawTitle ? decodeHtmlEntities(rawTitle).replace(/ : r\/[^ :]+$/, '') : undefined;
    return { videoUrl, title };
  }
  return null;
}

/** Hosts that serve Reddit's own post media (as opposed to avatars, awards, external links). */
const REDDIT_IMAGE_HOSTS = new Set(['i.redd.it', 'preview.redd.it']);

function isRedditImageUrl(url: string): boolean {
  try {
    return REDDIT_IMAGE_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Largest candidate of a srcset (entries are "url 320w, url 640w, ..."). */
function largestSrcsetCandidate(srcset: string): string | null {
  let best: { width: number; url: string } | null = null;
  for (const entry of srcset.split(',')) {
    const [url, descriptor] = entry.trim().split(/\s+/);
    if (!url) continue;
    const width = Number(descriptor?.match(/^(\d+)w$/)?.[1] ?? 0);
    if (!best || width > best.width) best = { width, url };
  }
  return best?.url ?? null;
}

/**
 * Extract the post's image URLs from a Reddit post page, in display order.
 * Single-image posts carry their full-resolution i.redd.it URL in the
 * <shreddit-post> tag's content-href; galleries render each slide as a
 * lightbox <img> whose srcset candidates are signed preview.redd.it URLs
 * (the signature only covers the exact query params, so URLs are kept
 * verbatim). Returns [] when the post has no Reddit-hosted images.
 * Exported separately so it can be unit-tested without network access.
 */
export function extractRedditImagesFromPostHtml(html: string): string[] {
  const postTag = html.match(/<shreddit-post\b[^>]*/)?.[0];
  if (!postTag) return [];

  // Single image post: <shreddit-post post-type="image" content-href="https://i.redd.it/...">
  if (postTag.match(/\bpost-type="([^"]*)"/)?.[1] === 'image') {
    const href = postTag.match(/\bcontent-href="([^"]+)"/)?.[1];
    const url = href ? decodeHtmlEntities(href) : '';
    return isRedditImageUrl(url) ? [url] : [];
  }

  // Gallery: each slide renders <img class="media-lightbox-img ..."> (plus a
  // decorative blurred copy we skip). Lazy slides move src/srcset into
  // data-lazy-* attributes.
  const carousel = html.match(/<gallery-carousel[\s\S]*?<\/gallery-carousel>/)?.[0];
  if (!carousel) return [];

  const urls: string[] = [];
  for (const img of carousel.match(/<img\b[^>]*/g) ?? []) {
    if (!/\bclass="[^"]*\bmedia-lightbox-img\b/.test(img)) continue;
    const srcset = img.match(/\b(?:data-lazy-)?srcset="([^"]*)"/)?.[1];
    const src = img.match(/\b(?:data-lazy-)?src="([^"]*)"/)?.[1];
    const raw = (srcset && largestSrcsetCandidate(decodeHtmlEntities(srcset))) || (src && decodeHtmlEntities(src)) || '';
    if (isRedditImageUrl(raw) && !urls.includes(raw)) urls.push(raw);
  }
  return urls;
}

/**
 * Fetch a page following redirects by hand so cookies survive across hops —
 * Reddit's bot-check clearance is cookie-based, and short links (redd.it,
 * /r/<sub>/s/<token>) redirect to the canonical post URL.
 */
async function fetchPage(
  url: string,
  jar: Map<string, string>,
  signal: AbortSignal | undefined,
): Promise<{ html: string; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        headers: {
          'user-agent': BROWSER_UA,
          accept: 'text/html',
          ...(jar.size > 0 ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        },
        ...(signal ? { signal } : {}),
      });
    } catch (cause) {
      throw new DownloadError(`Failed to fetch Reddit page ${current}`, { cause });
    }
    for (const setCookie of response.headers.getSetCookie()) {
      const pair = setCookie.split(';', 1)[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => {});
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      throw new DownloadError(`Reddit returned HTTP ${response.status} for ${current}`);
    }
    return { html: await response.text(), finalUrl: current };
  }
  throw new DownloadError(`Too many redirects while fetching Reddit page ${url}`);
}

/**
 * Resolve a Reddit post URL (canonical, share, or redd.it short link) to its
 * direct video stream URL by fetching the post page and answering Reddit's JS
 * challenge when one is served — no credentials and no Reddit API involved.
 */
export async function resolveRedditVideo(
  url: string,
  options: { signal?: AbortSignal | undefined; timeoutMs?: number | undefined } = {},
): Promise<RedditVideo> {
  const signals: AbortSignal[] = [];
  if (options.signal) signals.push(options.signal);
  if (options.timeoutMs && options.timeoutMs > 0) signals.push(AbortSignal.timeout(options.timeoutMs));
  const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined;

  const jar = new Map<string, string>();
  let page = await fetchPage(url, jar, signal);

  // Solving the challenge can redirect a short link to the canonical post URL,
  // which occasionally serves a second challenge of its own — allow a couple.
  for (let attempt = 0; attempt < 2; attempt++) {
    const challenge = parseRedditChallenge(page.html);
    if (!challenge) break;
    page = await fetchPage(buildChallengeAnswerUrl(page.finalUrl, challenge), jar, signal);
  }
  if (parseRedditChallenge(page.html)) {
    throw new DownloadError(
      `Reddit's bot check did not accept the computed answer for ${url}. ` +
        'The challenge format may have changed; as a workaround, pass --cookies-from-browser to go through yt-dlp with your account.',
    );
  }

  const video = extractRedditVideoFromPostHtml(page.html);
  if (!video) {
    // Only call it a video-less post when the post actually rendered — a
    // private/quarantined subreddit serves an interstitial with no post tag,
    // and that should stay a download failure (yt-dlp + cookies may reach it).
    if (/<shreddit-post\b/.test(page.html)) {
      const imageUrls = extractRedditImagesFromPostHtml(page.html);
      throw new NoVideoError(
        imageUrls.length > 0
          ? `Reddit post ${url} is an image post — there is no video to transcribe. ` +
            `The image URL${imageUrls.length > 1 ? 's are' : ' is'} attached to this error.`
          : `No video found in Reddit post ${url}. ` +
            'The post may be a text post or an external link (these are not supported).',
        imageUrls,
      );
    }
    throw new DownloadError(
      `No video found in Reddit post ${url}. ` +
        'The post may not contain a Reddit-hosted video (text/image posts and external links are not supported), ' +
        'or it may be in a private/quarantined subreddit.',
    );
  }
  return video;
}
