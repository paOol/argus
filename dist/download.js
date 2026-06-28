import { createWriteStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { downloadAudioStream } from './audio.js';
import { DownloadError, MissingBinaryError } from './errors.js';
import { ExecError, exec, findBinary } from './exec.js';
import { resolveRedditVideo } from './reddit.js';
import { resolveTelegramVideo } from './telegram.js';
import { resolveTwitterVideo } from './twitter.js';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
/** Follow xhslink.com (and similar) short-link redirects manually so yt-dlp sees the canonical URL. */
export async function resolveRedirects(url, signal) {
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
        let response;
        try {
            response = await fetch(current, {
                method: 'GET',
                redirect: 'manual',
                headers: { 'user-agent': BROWSER_UA },
                ...(signal ? { signal } : {}),
            });
        }
        catch (cause) {
            throw new DownloadError(`Failed to resolve short link ${current}`, { cause });
        }
        // Consume/cancel the body; we only need headers.
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
/** Stream a direct media URL to disk without buffering it in memory. */
export async function streamToFile(url, destPath, options = {}) {
    const signals = [];
    if (options.signal)
        signals.push(options.signal);
    if (options.timeoutMs && options.timeoutMs > 0)
        signals.push(AbortSignal.timeout(options.timeoutMs));
    const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined;
    let response;
    try {
        response = await fetch(url, {
            headers: { 'user-agent': BROWSER_UA, ...options.headers },
            ...(signal ? { signal } : {}),
        });
    }
    catch (cause) {
        throw new DownloadError(`Failed to download ${url}`, { cause });
    }
    if (!response.ok || !response.body) {
        throw new DownloadError(`Download of ${url} failed with HTTP ${response.status}`);
    }
    const total = Number(response.headers.get('content-length')) || 0;
    let received = 0;
    let lastEmitted = -1;
    const counter = new TransformStream({
        transform(chunk, controller) {
            received += chunk.byteLength;
            if (options.onProgress && total > 0) {
                const percent = Math.min(100, Math.floor((received / total) * 100));
                if (percent !== lastEmitted) {
                    lastEmitted = percent;
                    options.onProgress(percent);
                }
            }
            controller.enqueue(chunk);
        },
    });
    await pipeline(Readable.fromWeb(response.body.pipeThrough(counter)), createWriteStream(destPath), ...(signal ? [{ signal }] : []));
}
/**
 * XHS's new rednote.com domain serves the same notes, but yt-dlp's extractor
 * only matches the original domain — swap the host.
 */
export function rewriteRednoteHost(url) {
    const parsed = new URL(url);
    if (!/(^|\.)rednote\.com$/i.test(parsed.hostname))
        return url;
    parsed.hostname = 'www.xiaohongshu.com';
    return parsed.toString();
}
/**
 * XHS's bot wall bounces some requests to /404 but embeds the canonical note
 * URL in a (sometimes nested) redirectPath query param — recover it.
 */
export function recoverXhsBotWallRedirect(target) {
    if (!new URL(target).pathname.startsWith('/404'))
        return target;
    const match = target.match(/redirectPath=([^&]+)/);
    if (!match?.[1])
        return target;
    const recovered = decodeURIComponent(match[1]);
    return recovered.startsWith('http') ? recovered : target;
}
/** True when the URL points at a concrete XHS note rather than a feed/error page. */
export function isXhsNoteUrl(url) {
    return /\/(explore|discovery\/item)\/[0-9a-f]+/i.test(new URL(url).pathname);
}
const YT_DLP_INSTALL_HINT = 'Install it with `brew install yt-dlp` (macOS), `pipx install yt-dlp`, or see https://github.com/yt-dlp/yt-dlp#installation';
async function downloadWithYtDlp(url, destDir, options) {
    const ytDlp = findBinary(['yt-dlp'], options.ytDlpPath);
    if (!ytDlp)
        throw new MissingBinaryError('yt-dlp', YT_DLP_INSTALL_HINT);
    // Audio-only formats keep downloads small; `/best` is the fallback for sites
    // (like Instagram) that only serve progressive video+audio files.
    const args = [
        '--no-playlist',
        '--no-warnings',
        '--newline',
        '-f', 'bestaudio/best',
        '-o', join(destDir, 'media.%(ext)s'),
        '--no-simulate',
        '--print', 'after_move:filepath',
        '--print', 'title',
    ];
    // yt-dlp rejects --cookies and --cookies-from-browser together; prefer the
    // file form (works headless and self-refreshes) when both are provided.
    if (options.cookiesFile) {
        args.push('--cookies', options.cookiesFile);
    }
    else if (options.cookiesFromBrowser) {
        args.push('--cookies-from-browser', options.cookiesFromBrowser);
    }
    args.push('--', url);
    let stdout;
    try {
        const result = await exec(ytDlp, args, {
            timeoutMs: options.timeoutMs,
            signal: options.signal,
            onLine: (line) => {
                const match = line.match(/^\[download\]\s+(\d+(?:\.\d+)?)%/);
                if (match?.[1] && options.onProgress) {
                    options.onProgress({ stage: 'download', percent: Number(match[1]) });
                }
            },
        });
        stdout = result.stdout;
    }
    catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
            throw new MissingBinaryError('yt-dlp', YT_DLP_INSTALL_HINT);
        }
        const detail = cause instanceof ExecError ? `\n${cause.stderrTail.trim().split('\n').slice(-8).join('\n')}` : '';
        // Extractors break as sites change; a stale yt-dlp is by far the most common cause.
        const staleHint = cause instanceof ExecError && /403|Forbidden|Unable to extract|nsig|Sign in to confirm/i.test(cause.stderrTail)
            ? '\nThis often means yt-dlp is outdated — update it (e.g. `yt-dlp -U` or `brew upgrade yt-dlp`) and retry.'
            : '';
        throw new DownloadError(`yt-dlp failed for ${url}${detail}${staleHint}`, { cause });
    }
    // `--print title` and `--print after_move:filepath` each emit one line, in that order.
    const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    const filePath = lines.at(-1);
    const title = lines.length > 1 ? lines.at(-2) : undefined;
    if (filePath)
        return { filePath, title };
    // Very old yt-dlp builds may not support after_move:filepath — fall back to
    // scanning the (per-job, otherwise empty) destination directory.
    const entries = await readdir(destDir);
    const media = entries.find((name) => name.startsWith('media.'));
    if (!media)
        throw new DownloadError(`yt-dlp reported success but produced no file for ${url}`);
    return { filePath: join(destDir, media), title };
}
async function downloadRedditAudio(url, destDir, options) {
    const emit = options.onProgress ?? (() => { });
    emit({ stage: 'resolve', message: 'Resolving Reddit post' });
    const { videoUrl, title } = await resolveRedditVideo(url, {
        signal: options.signal,
        timeoutMs: options.timeoutMs,
    });
    emit({ stage: 'download', message: 'Downloading audio from Reddit CDN' });
    const filePath = join(destDir, 'media.m4a');
    await downloadAudioStream(videoUrl, filePath, {
        ffmpegPath: options.ffmpegPath,
        userAgent: BROWSER_UA,
        timeoutMs: options.timeoutMs,
        signal: options.signal,
    });
    return { filePath, title };
}
async function downloadTwitterAudio(url, destDir, options) {
    const emit = options.onProgress ?? (() => { });
    emit({ stage: 'resolve', message: 'Resolving tweet' });
    const { videoUrl, title } = await resolveTwitterVideo(url, {
        signal: options.signal,
        timeoutMs: options.timeoutMs,
    });
    emit({ stage: 'download', message: 'Downloading audio from Twitter CDN' });
    const filePath = join(destDir, 'media.m4a');
    await downloadAudioStream(videoUrl, filePath, {
        ffmpegPath: options.ffmpegPath,
        userAgent: BROWSER_UA,
        timeoutMs: options.timeoutMs,
        signal: options.signal,
    });
    return { filePath, ...(title !== undefined ? { title } : {}) };
}
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
export async function downloadMedia(url, platform, destDir, options = {}) {
    const emit = options.onProgress ?? (() => { });
    if (platform === 'telegram') {
        emit({ stage: 'resolve', message: 'Resolving Telegram embed' });
        const { videoUrl, post } = await resolveTelegramVideo(url, {
            signal: options.signal,
            timeoutMs: options.timeoutMs,
        });
        const filePath = join(destDir, 'media.mp4');
        emit({ stage: 'download', message: `Downloading from Telegram CDN` });
        await streamToFile(videoUrl, filePath, {
            signal: options.signal,
            timeoutMs: options.timeoutMs,
            onProgress: (percent) => emit({ stage: 'download', ...(percent !== undefined ? { percent } : {}) }),
        });
        return { filePath, title: `Telegram: ${post.channel}/${post.messageId}` };
    }
    if (platform === 'reddit') {
        try {
            return await downloadRedditAudio(url, destDir, options);
        }
        catch (cause) {
            // With browser cookies, yt-dlp's authenticated Reddit extractor can
            // handle posts the anonymous page-scrape cannot (private subs, etc.).
            if (!options.cookiesFromBrowser)
                throw cause;
            return downloadWithYtDlp(url, destDir, options);
        }
    }
    if (platform === 'twitter') {
        try {
            return await downloadTwitterAudio(url, destDir, options);
        }
        catch (cause) {
            // With browser cookies, yt-dlp's authenticated extractor can reach
            // protected/age-gated tweets the anonymous syndication endpoint cannot.
            if (!options.cookiesFromBrowser)
                throw cause;
            return downloadWithYtDlp(url, destDir, options);
        }
    }
    let target = url;
    if (platform === 'xiaohongshu') {
        target = rewriteRednoteHost(target);
        if (new URL(target).hostname.toLowerCase() === 'xhslink.com') {
            emit({ stage: 'resolve', message: 'Resolving Xiaohongshu short link' });
            target = recoverXhsBotWallRedirect(await resolveRedirects(target, options.signal));
            // Dead/expired share links bounce to the generic feed instead of a note page.
            if (!isXhsNoteUrl(target)) {
                throw new DownloadError(`Xiaohongshu short link ${url} appears to be expired or invalid (it redirected to ${target} rather than a note page). ` +
                    'Re-copy a fresh share link from the app — they expire after a while.');
            }
        }
    }
    return downloadWithYtDlp(target, destDir, options);
}
//# sourceMappingURL=download.js.map