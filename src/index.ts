import { mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractAudio } from './audio.js';
import { downloadMedia } from './download.js';
import { exec, findBinary } from './exec.js';
import { DEFAULT_MODEL, resolveModel } from './models.js';
import { detectPlatform } from './platform.js';
import type {
  DependencyReport,
  DependencyStatus,
  BinaryPaths,
  TranscribeFileOptions,
  TranscribeOptions,
  TranscribeResult,
} from './types.js';
import { findWhisperBinary, runWhisper } from './whisper.js';

export { detectPlatform } from './platform.js';
export { parseTelegramUrl, resolveTelegramVideo, extractVideoUrlFromEmbedHtml } from './telegram.js';
export { resolveRedditVideo, extractRedditVideoFromPostHtml, parseRedditChallenge } from './reddit.js';
export {
  resolveTwitterVideo,
  parseTwitterStatusUrl,
  buildSyndicationToken,
  extractTwitterVideoFromSyndication,
  pickAudioRenditionUrl,
} from './twitter.js';
export { resolveModel, defaultModelDir, KNOWN_MODELS, DEFAULT_MODEL } from './models.js';
export { toSrt, toVtt, toTimestampedText } from './format.js';
export {
  ArgusError,
  UnsupportedUrlError,
  MissingBinaryError,
  DownloadError,
  AudioExtractionError,
  ModelFetchError,
  TranscriptionError,
} from './errors.js';
export type {
  Platform,
  TranscriptSegment,
  TranscribeResult,
  TranscribeOptions,
  TranscribeFileOptions,
  WhisperModel,
  BinaryPaths,
  ProgressEvent,
  ProgressStage,
  DependencyReport,
  DependencyStatus,
} from './types.js';

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
export async function transcribe(url: string, options: TranscribeOptions = {}): Promise<TranscribeResult> {
  const platform = detectPlatform(url);
  const emit = options.onProgress ?? (() => {});

  const workDir = await mkdtemp(join(options.tempDir ?? tmpdir(), 'argus-'));
  try {
    // Resolve the model first (and in parallel with nothing else heavy): a bad
    // model name should fail before we spend bandwidth on the video.
    const modelPath = await resolveModel(options.model ?? DEFAULT_MODEL, {
      modelDir: options.modelDir,
      signal: options.signal,
      onProgress: options.onProgress,
    });

    emit({ stage: 'download', message: `Downloading media (${platform})` });
    const media = await downloadMedia(url, platform, workDir, {
      ytDlpPath: options.binaries?.ytDlp,
      ffmpegPath: options.binaries?.ffmpeg,
      cookiesFromBrowser: options.cookiesFromBrowser,
      cookiesFile: options.cookiesFile,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
      onProgress: options.onProgress,
    });

    emit({ stage: 'extract-audio', message: 'Extracting audio' });
    const wavPath = join(workDir, 'audio.wav');
    const { durationSeconds } = await extractAudio(media.filePath, wavPath, {
      ffmpegPath: options.binaries?.ffmpeg,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });
    // The downloaded media is no longer needed; drop it now to halve peak disk use.
    await rm(media.filePath, { force: true }).catch(() => {});

    emit({ stage: 'transcribe', message: 'Transcribing audio' });
    const output = await runWhisper(wavPath, modelPath, {
      whisperPath: options.binaries?.whisper,
      language: options.language,
      threads: options.threads,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
      onProgress: options.onProgress,
      workDir,
    });

    const result: TranscribeResult = {
      text: output.text,
      segments: output.segments,
      language: output.language,
      platform,
      durationSeconds,
      ...(media.title !== undefined ? { title: media.title } : {}),
    };

    if (options.keepAudio) {
      // Move the WAV out of the temp dir (which we are about to delete).
      const kept = join(options.tempDir ?? tmpdir(), `argus-audio-${Date.now()}.wav`);
      await rename(wavPath, kept);
      result.audioPath = kept;
    }

    return result;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Transcribe a local media file (any container/codec ffmpeg can read) —
 * useful for videos saved from private Telegram chats or anywhere else.
 */
export async function transcribeFile(
  filePath: string,
  options: TranscribeFileOptions = {},
): Promise<TranscribeResult> {
  const emit = options.onProgress ?? (() => {});

  const workDir = await mkdtemp(join(options.tempDir ?? tmpdir(), 'argus-'));
  try {
    const modelPath = await resolveModel(options.model ?? DEFAULT_MODEL, {
      modelDir: options.modelDir,
      signal: options.signal,
      onProgress: options.onProgress,
    });

    emit({ stage: 'extract-audio', message: 'Extracting audio' });
    const wavPath = join(workDir, 'audio.wav');
    const { durationSeconds } = await extractAudio(filePath, wavPath, {
      ffmpegPath: options.binaries?.ffmpeg,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });

    emit({ stage: 'transcribe', message: 'Transcribing audio' });
    const output = await runWhisper(wavPath, modelPath, {
      whisperPath: options.binaries?.whisper,
      language: options.language,
      threads: options.threads,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
      onProgress: options.onProgress,
      workDir,
    });

    const result: TranscribeResult = {
      text: output.text,
      segments: output.segments,
      language: output.language,
      platform: 'generic',
      durationSeconds,
    };

    if (options.keepAudio) {
      const kept = join(options.tempDir ?? tmpdir(), `argus-audio-${Date.now()}.wav`);
      await rename(wavPath, kept);
      result.audioPath = kept;
    }

    return result;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function probeBinary(path: string | null, versionArgs: string[]): Promise<DependencyStatus> {
  if (!path) return { found: false };
  try {
    const { stdout, stderr } = await exec(path, versionArgs, { timeoutMs: 10_000 });
    const version = (stdout || stderr).trim().split('\n')[0];
    return { found: true, path, ...(version ? { version } : {}) };
  } catch {
    // The binary exists but the version probe failed (e.g. whisper.cpp's
    // `main` has no --version); it is still usable.
    return { found: true, path };
  }
}

/**
 * Check that the three required local tools are available, with versions.
 * Use this for a fast preflight before calling {@link transcribe}.
 */
export async function checkDependencies(binaries: BinaryPaths = {}): Promise<DependencyReport> {
  const [ytDlp, ffmpeg, whisper] = await Promise.all([
    probeBinary(findBinary(['yt-dlp'], binaries.ytDlp), ['--version']),
    probeBinary(findBinary(['ffmpeg'], binaries.ffmpeg), ['-version']),
    probeBinary(findWhisperBinary(binaries.whisper), ['--help']),
  ]);
  return { ytDlp, ffmpeg, whisper, ok: ytDlp.found && ffmpeg.found && whisper.found };
}
