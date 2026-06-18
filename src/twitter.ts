import { DownloadError } from './errors.js';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Public guest endpoint behind embedded tweets — serves tweet JSON without auth. */
const SYNDICATION_ENDPOINT = 'https://cdn.syndication.twimg.com/tweet-result';

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
export function parseTwitterStatusUrl(url: string): TwitterStatus | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Match the segment right before `status/<id>` — the author handle for
  // `/<user>/status/<id>`, or `i`/`web` for `/i/status/<id>` and `/i/web/status/<id>`.
  const match = parsed.pathname.match(/(?:^|\/)([^/]+)\/status\/(\d+)/);
  if (!match) return null;
  const owner = match[1];
  const id = match[2]!;
  const screenName = owner && owner !== 'i' && owner !== 'web' ? owner : undefined;
  return { id, ...(screenName ? { screenName } : {}) };
}

/**
 * Compute the `token` the syndication endpoint requires. It is derived purely
 * from the tweet id: `((id / 1e15) * π)` rendered in base 36 with zeros and the
 * decimal point stripped — the same transform Twitter's embed script uses.
 * Exported separately so it can be unit-tested.
 */
export function buildSyndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

interface NormalizedVariant {
  contentType: string;
  url: string;
  bitrate: number;
}

/** Pull video variants out of either syndication shape (`video.variants` or `mediaDetails[].video_info`). */
function collectVariants(json: unknown): NormalizedVariant[] {
  const root = json as Record<string, any>;
  const raw: any[] = [];
  if (Array.isArray(root?.video?.variants)) raw.push(...root.video.variants);
  for (const media of Array.isArray(root?.mediaDetails) ? root.mediaDetails : []) {
    if (media?.type === 'video' || media?.type === 'animated_gif') {
      if (Array.isArray(media?.video_info?.variants)) raw.push(...media.video_info.variants);
    }
  }
  return raw
    .map((v) => ({
      // `video.variants` uses {type, src}; v1.1 `video_info` uses {content_type, url, bitrate}.
      contentType: String(v.contentType ?? v.content_type ?? v.type ?? ''),
      url: String(v.src ?? v.url ?? ''),
      bitrate: Number(v.bitrate ?? 0),
    }))
    .filter((v) => v.url);
}

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
export function extractTwitterVideoFromSyndication(json: unknown): TwitterVideo | null {
  const variants = collectVariants(json);
  if (variants.length === 0) return null;

  const hls = variants.find((v) => /mpegurl/i.test(v.contentType) || /\.m3u8(\?|$)/i.test(v.url));
  const mp4 = variants
    .filter((v) => /mp4/i.test(v.contentType) || /\.mp4(\?|$)/i.test(v.url))
    .sort((a, b) => b.bitrate - a.bitrate)[0];
  const chosen = hls ?? mp4;
  if (!chosen) return null;

  const text = (json as Record<string, any>)?.text;
  const title = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() || undefined : undefined;
  return { videoUrl: chosen.url, isHls: Boolean(hls), ...(title ? { title } : {}) };
}

/**
 * From an HLS master playlist, return the URL of the highest-bitrate standalone
 * audio rendition (`#EXT-X-MEDIA:TYPE=AUDIO`). This lets ffmpeg fetch only the
 * audio segments instead of the full video. Returns null when the master has no
 * separate audio rendition (rare for Twitter `amplify_video`).
 * Exported separately so it can be unit-tested without network access.
 */
export function pickAudioRenditionUrl(masterM3u8: string, baseUrl: string): string | null {
  let best: { bitrate: number; url: string } | null = null;
  for (const line of masterM3u8.split('\n')) {
    if (!/^#EXT-X-MEDIA:/.test(line) || !/\bTYPE=AUDIO\b/.test(line)) continue;
    const uri = line.match(/\bURI="([^"]+)"/)?.[1];
    if (!uri) continue;
    // Twitter names audio groups "audio-<bitrate>"; fall back to the path's number.
    const bitrate = Number(line.match(/GROUP-ID="audio-(\d+)"/)?.[1] ?? uri.match(/\/mp4a\/(\d+)\//)?.[1] ?? 0);
    if (!best || bitrate > best.bitrate) {
      best = { bitrate, url: new URL(uri, baseUrl).toString() };
    }
  }
  return best?.url ?? null;
}

/**
 * Resolve a tweet URL to a directly-downloadable audio/video stream URL using
 * Twitter's public syndication endpoint — no login, no API keys, no yt-dlp.
 * When the tweet's video is served over HLS, the returned URL points at the
 * audio-only rendition so the download stays small.
 */
export async function resolveTwitterVideo(
  url: string,
  options: { signal?: AbortSignal | undefined; timeoutMs?: number | undefined } = {},
): Promise<TwitterVideo> {
  const status = parseTwitterStatusUrl(url);
  if (!status) {
    throw new DownloadError(
      `Not a tweet URL: ${url}. Expected something like https://x.com/<user>/status/<id>.`,
    );
  }

  const signals: AbortSignal[] = [];
  if (options.signal) signals.push(options.signal);
  if (options.timeoutMs && options.timeoutMs > 0) signals.push(AbortSignal.timeout(options.timeoutMs));
  const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined;

  const endpoint = new URL(SYNDICATION_ENDPOINT);
  endpoint.searchParams.set('id', status.id);
  endpoint.searchParams.set('token', buildSyndicationToken(status.id));
  endpoint.searchParams.set('lang', 'en');

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    throw new DownloadError(`Failed to fetch tweet ${status.id} from Twitter`, { cause });
  }
  if (response.status === 404) {
    throw new DownloadError(
      `Tweet ${status.id} is unavailable (deleted, protected, or age-restricted). ` +
        'Protected or login-gated tweets can sometimes be fetched via yt-dlp with --cookies-from-browser.',
    );
  }
  if (!response.ok) {
    throw new DownloadError(`Twitter returned HTTP ${response.status} for tweet ${status.id}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    throw new DownloadError(`Twitter returned a non-JSON response for tweet ${status.id}`, { cause });
  }

  const video = extractTwitterVideoFromSyndication(json);
  if (!video) {
    throw new DownloadError(
      `No video found in tweet ${url}. ` +
        'The tweet may contain only text/images, or its video may be an external link (these are not supported).',
    );
  }

  if (!video.isHls) return video;

  // Fetch the HLS master and swap in the audio-only rendition to avoid pulling
  // the video segments. If that fails for any reason, fall back to the master
  // (ffmpeg will still produce audio, just downloading more).
  try {
    const master = await fetch(video.videoUrl, {
      headers: { 'user-agent': BROWSER_UA },
      ...(signal ? { signal } : {}),
    });
    if (master.ok) {
      const audioUrl = pickAudioRenditionUrl(await master.text(), video.videoUrl);
      if (audioUrl) return { ...video, videoUrl: audioUrl };
    } else {
      await master.body?.cancel().catch(() => {});
    }
  } catch {
    // Ignore — fall through to the master playlist.
  }
  return video;
}
