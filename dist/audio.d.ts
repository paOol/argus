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
//# sourceMappingURL=audio.d.ts.map