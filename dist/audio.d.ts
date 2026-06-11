export interface ExtractAudioOptions {
    ffmpegPath?: string | undefined;
    timeoutMs?: number | undefined;
    signal?: AbortSignal | undefined;
}
/**
 * Strip the audio track from any media file and resample it to the 16 kHz
 * mono 16-bit WAV that whisper.cpp expects.
 *
 * Returns the audio duration in seconds (derived from the WAV size — exact
 * for PCM).
 */
export declare function extractAudio(inputPath: string, outputPath: string, options?: ExtractAudioOptions): Promise<{
    durationSeconds: number;
}>;
export interface DownloadAudioStreamOptions {
    ffmpegPath?: string | undefined;
    userAgent?: string | undefined;
    timeoutMs?: number | undefined;
    signal?: AbortSignal | undefined;
}
/**
 * Download just the audio track of a remote stream (HLS playlist or MP4 URL)
 * into a local .m4a, copying the codec — ffmpeg fetches only the audio
 * segments, so this is far smaller than downloading the video.
 */
export declare function downloadAudioStream(streamUrl: string, outputPath: string, options?: DownloadAudioStreamOptions): Promise<void>;
//# sourceMappingURL=audio.d.ts.map