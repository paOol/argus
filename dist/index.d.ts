import type { DependencyReport, BinaryPaths, TranscribeFileOptions, TranscribeOptions, TranscribeResult } from './types.js';
export { detectPlatform } from './platform.js';
export { parseTelegramUrl, resolveTelegramVideo, extractVideoUrlFromEmbedHtml, extractPhotoUrlsFromEmbedHtml, } from './telegram.js';
export { resolveRedditVideo, extractRedditVideoFromPostHtml, extractRedditImagesFromPostHtml, parseRedditChallenge, } from './reddit.js';
export { resolveTwitterVideo, parseTwitterStatusUrl, buildSyndicationToken, extractTwitterVideoFromSyndication, extractTwitterImagesFromSyndication, pickAudioRenditionUrl, } from './twitter.js';
export { resolveInstagramVideo, parseInstagramUrl, extractInstagramVideoFromWebInfo, extractInstagramImagesFromWebInfo, pickDashAudioUrl, } from './instagram.js';
export { resolveModel, defaultModelDir, KNOWN_MODELS, DEFAULT_MODEL } from './models.js';
export { toSrt, toVtt, toTimestampedText } from './format.js';
export { ArgusError, UnsupportedUrlError, MissingBinaryError, DownloadError, NoVideoError, AudioExtractionError, ModelFetchError, TranscriptionError, } from './errors.js';
export type { Platform, TranscriptSegment, TranscribeResult, TranscribeOptions, TranscribeFileOptions, WhisperModel, BinaryPaths, ProgressEvent, ProgressStage, DependencyReport, DependencyStatus, } from './types.js';
/**
 * Transcribe the audio of a video URL (YouTube, Instagram, Xiaohongshu,
 * Telegram, Reddit, Twitter/X, or anything yt-dlp supports) entirely with
 * local tools.
 *
 * Pipeline: detect platform → download (audio-only when the site allows it)
 * → strip/resample audio with ffmpeg → transcribe with whisper.cpp.
 * Scratch files live in a per-job temp directory that is always removed;
 * the source media file is deleted as soon as the WAV exists to keep peak
 * disk usage low.
 */
export declare function transcribe(url: string, options?: TranscribeOptions): Promise<TranscribeResult>;
/**
 * Transcribe a local media file (any container/codec ffmpeg can read) —
 * useful for videos saved from private Telegram chats or anywhere else.
 */
export declare function transcribeFile(filePath: string, options?: TranscribeFileOptions): Promise<TranscribeResult>;
/**
 * Check that the three required local tools are available, with versions.
 * Use this for a fast preflight before calling {@link transcribe}.
 */
export declare function checkDependencies(binaries?: BinaryPaths): Promise<DependencyReport>;
//# sourceMappingURL=index.d.ts.map