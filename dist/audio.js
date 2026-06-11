import { stat } from 'node:fs/promises';
import { AudioExtractionError, MissingBinaryError } from './errors.js';
import { ExecError, exec, findBinary } from './exec.js';
const FFMPEG_INSTALL_HINT = 'Install it with `brew install ffmpeg` (macOS), `apt install ffmpeg` (Debian/Ubuntu), or see https://ffmpeg.org/download.html';
/** Bytes per second of 16 kHz mono s16le PCM. */
const WAV_BYTES_PER_SECOND = 16000 * 2;
/**
 * Strip the audio track from any media file and resample it to the 16 kHz
 * mono 16-bit WAV that whisper.cpp expects.
 *
 * Returns the audio duration in seconds (derived from the WAV size — exact
 * for PCM).
 */
export async function extractAudio(inputPath, outputPath, options = {}) {
    const ffmpeg = findBinary(['ffmpeg'], options.ffmpegPath);
    if (!ffmpeg)
        throw new MissingBinaryError('ffmpeg', FFMPEG_INSTALL_HINT);
    const args = [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-i', inputPath,
        '-vn', '-sn', '-dn', // drop video, subtitle, and data streams
        '-ac', '1',
        '-ar', '16000',
        '-c:a', 'pcm_s16le',
        outputPath,
    ];
    try {
        await exec(ffmpeg, args, { timeoutMs: options.timeoutMs, signal: options.signal });
    }
    catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
            throw new MissingBinaryError('ffmpeg', FFMPEG_INSTALL_HINT);
        }
        if (cause instanceof ExecError && /does not contain any stream|Stream map .* matches no streams/i.test(cause.stderrTail)) {
            throw new AudioExtractionError(`The video has no audio track, so there is nothing to transcribe (${inputPath})`, { cause });
        }
        const detail = cause instanceof ExecError ? `\n${cause.stderrTail.trim().split('\n').slice(-6).join('\n')}` : '';
        throw new AudioExtractionError(`ffmpeg failed to extract audio from ${inputPath}${detail}`, { cause });
    }
    let size;
    try {
        size = (await stat(outputPath)).size;
    }
    catch (cause) {
        throw new AudioExtractionError(`ffmpeg produced no output file at ${outputPath}`, { cause });
    }
    if (size <= 44) {
        throw new AudioExtractionError(`Extracted audio from ${inputPath} is empty — the source may have no audio track`);
    }
    return { durationSeconds: (size - 44) / WAV_BYTES_PER_SECOND };
}
//# sourceMappingURL=audio.js.map