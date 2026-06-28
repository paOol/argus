/** Platforms with first-class support. `generic` falls through to yt-dlp's 1800+ extractors. */
export type Platform = 'youtube' | 'instagram' | 'xiaohongshu' | 'telegram' | 'reddit' | 'twitter' | 'generic';
export interface TranscriptSegment {
    /** Segment start time in seconds. */
    start: number;
    /** Segment end time in seconds. */
    end: number;
    text: string;
}
export interface TranscribeResult {
    /** Full transcript text. */
    text: string;
    /** Timestamped segments. */
    segments: TranscriptSegment[];
    /** Detected (or forced) language code, e.g. "en", "zh". */
    language: string;
    platform: Platform;
    /** Duration of the extracted audio in seconds. */
    durationSeconds: number;
    /** Title reported by the extractor, when available. */
    title?: string;
    /** Path to the 16 kHz mono WAV, only set when `keepAudio: true`. */
    audioPath?: string;
}
export interface BinaryPaths {
    /** Path to yt-dlp. Default: found on PATH. */
    ytDlp?: string;
    /** Path to ffmpeg. Default: found on PATH. */
    ffmpeg?: string;
    /** Path to whisper.cpp CLI (whisper-cli / whisper-cpp). Default: found on PATH. */
    whisper?: string;
}
/**
 * Named ggml model from the whisper.cpp collection (downloaded once, cached locally),
 * or an absolute/relative path to a ggml `.bin` file you already have.
 */
export type WhisperModel = 'tiny' | 'tiny.en' | 'tiny-q5_1' | 'tiny.en-q5_1' | 'base' | 'base.en' | 'base-q5_1' | 'base.en-q5_1' | 'small' | 'small.en' | 'small-q5_1' | 'small.en-q5_1' | 'medium' | 'medium.en' | 'medium-q5_0' | 'medium.en-q5_0' | 'large-v2' | 'large-v2-q5_0' | 'large-v3' | 'large-v3-q5_0' | 'large-v3-turbo' | 'large-v3-turbo-q5_0' | (string & {});
export type ProgressStage = 'resolve' | 'download' | 'extract-audio' | 'fetch-model' | 'transcribe';
export interface ProgressEvent {
    stage: ProgressStage;
    /** 0–100 when measurable; absent otherwise. */
    percent?: number;
    message?: string;
}
export interface TranscribeOptions {
    /**
     * Whisper model to use. Default: `base-q5_1` (~60 MB, quantized — lean and fast).
     * Use `small` / `small-q5_1` for noticeably better quality on non-English audio
     * (e.g. Mandarin content from Xiaohongshu).
     */
    model?: WhisperModel;
    /** Force a language code (e.g. "zh", "en"). Default: "auto" (detect). */
    language?: string;
    /** Directory for cached ggml models. Default: `$ARGUS_MODEL_DIR` or `~/.cache/argus/models`. */
    modelDir?: string;
    /** Directory for scratch files. Default: the OS temp dir. A per-job subdirectory is always created and removed. */
    tempDir?: string;
    /** Keep the extracted 16 kHz WAV and return its path in `audioPath`. Default: false. */
    keepAudio?: boolean;
    /** whisper.cpp thread count. Default: whisper.cpp's own default (min(4, cores)). */
    threads?: number;
    /** Explicit binary locations; anything omitted is resolved from PATH. */
    binaries?: BinaryPaths;
    /**
     * Browser to read cookies from, passed to yt-dlp's `--cookies-from-browser`
     * (e.g. "chrome", "firefox", "safari"). Needed for login-gated Instagram posts.
     */
    cookiesFromBrowser?: string;
    /**
     * Path to a Netscape-format cookies.txt, passed to yt-dlp's `--cookies`.
     * Unlike {@link cookiesFromBrowser} this needs no browser, so it works on
     * headless servers. yt-dlp rewrites the file in place with refreshed session
     * cookies after each run, so a file on a persistent volume keeps a
     * login-gated session (e.g. Instagram) alive without manual rotation.
     * Takes precedence over `cookiesFromBrowser` (yt-dlp rejects both at once).
     */
    cookiesFile?: string;
    /** Per-step timeout in milliseconds (applies to download, audio extraction, and transcription each). */
    timeoutMs?: number;
    /** Progress callback. */
    onProgress?: (event: ProgressEvent) => void;
    /** Abort the whole pipeline. */
    signal?: AbortSignal;
}
/** Options accepted by {@link transcribeFile} — everything except download-related fields. */
export type TranscribeFileOptions = Omit<TranscribeOptions, 'cookiesFromBrowser' | 'cookiesFile'>;
export interface DependencyStatus {
    found: boolean;
    path?: string;
    version?: string;
}
export interface DependencyReport {
    ytDlp: DependencyStatus;
    ffmpeg: DependencyStatus;
    whisper: DependencyStatus;
    ok: boolean;
}
//# sourceMappingURL=types.d.ts.map