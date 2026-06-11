import type { ProgressEvent, TranscriptSegment } from './types.js';
export declare const WHISPER_INSTALL_HINT = "Install whisper.cpp with `brew install whisper-cpp` (macOS) or build it from https://github.com/ggml-org/whisper.cpp";
export interface RunWhisperOptions {
    whisperPath?: string | undefined;
    language?: string | undefined;
    threads?: number | undefined;
    timeoutMs?: number | undefined;
    signal?: AbortSignal | undefined;
    onProgress?: ((event: ProgressEvent) => void) | undefined;
    /** Directory for whisper's JSON output file (removed afterwards). */
    workDir: string;
}
export interface WhisperOutput {
    text: string;
    segments: TranscriptSegment[];
    language: string;
}
/** Parse whisper.cpp's -oj JSON output. Exported for unit testing. */
export declare function parseWhisperJson(raw: string, fallbackLanguage: string): WhisperOutput;
export declare function findWhisperBinary(override?: string): string | null;
/** Run whisper.cpp on a 16 kHz mono WAV file and return the parsed transcript. */
export declare function runWhisper(audioPath: string, modelPath: string, options: RunWhisperOptions): Promise<WhisperOutput>;
//# sourceMappingURL=whisper.d.ts.map