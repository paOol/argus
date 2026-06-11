import { DownloadError } from './errors.js';

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
    throw new DownloadError(
      `No video found in Reddit post ${url}. ` +
        'The post may not contain a Reddit-hosted video (text/image posts and external links are not supported), ' +
        'or it may be in a private/quarantined subreddit.',
    );
  }
  return video;
}
