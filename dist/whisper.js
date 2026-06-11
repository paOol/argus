import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { MissingBinaryError, TranscriptionError } from './errors.js';
import { ExecError, exec, findBinary } from './exec.js';
export const WHISPER_INSTALL_HINT = 'Install whisper.cpp with `brew install whisper-cpp` (macOS) or build it from https://github.com/ggml-org/whisper.cpp';
/** Binary names across whisper.cpp versions/packagings, newest first. */
const WHISPER_BINARY_CANDIDATES = ['whisper-cli', 'whisper-cpp', 'whisper.cpp', 'main'];
/** Parse whisper.cpp's -oj JSON output. Exported for unit testing. */
export function parseWhisperJson(raw, fallbackLanguage) {
    let json;
    try {
        json = JSON.parse(raw);
    }
    catch (cause) {
        throw new TranscriptionError('whisper.cpp produced unparseable JSON output', { cause });
    }
    const segments = (json.transcription ?? [])
        .map((entry) => ({
        start: (entry.offsets?.from ?? 0) / 1000,
        end: (entry.offsets?.to ?? 0) / 1000,
        text: (entry.text ?? '').trim(),
    }))
        .filter((segment) => segment.text.length > 0);
    return {
        text: segments.map((segment) => segment.text).join(' ').trim(),
        segments,
        language: json.result?.language ?? fallbackLanguage,
    };
}
export function findWhisperBinary(override) {
    return findBinary(WHISPER_BINARY_CANDIDATES, override);
}
/** Run whisper.cpp on a 16 kHz mono WAV file and return the parsed transcript. */
export async function runWhisper(audioPath, modelPath, options) {
    const whisper = findWhisperBinary(options.whisperPath);
    if (!whisper)
        throw new MissingBinaryError('whisper-cli', WHISPER_INSTALL_HINT);
    const outputBase = join(options.workDir, 'transcript');
    const language = options.language && options.language !== 'auto' ? options.language : 'auto';
    const args = [
        '-m', modelPath,
        '-f', audioPath,
        '-l', language,
        '-oj',
        '-of', outputBase,
        '--no-prints',
        '--print-progress',
    ];
    if (options.threads && options.threads > 0) {
        args.push('-t', String(options.threads));
    }
    try {
        await exec(whisper, args, {
            timeoutMs: options.timeoutMs,
            signal: options.signal,
            onLine: (line) => {
                // whisper.cpp emits "whisper_print_progress_callback: progress =  10%"
                const match = line.match(/progress\s*=\s*(\d+)%/);
                if (match?.[1] && options.onProgress) {
                    options.onProgress({ stage: 'transcribe', percent: Number(match[1]) });
                }
            },
        });
    }
    catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
            throw new MissingBinaryError('whisper-cli', WHISPER_INSTALL_HINT);
        }
        const detail = cause instanceof ExecError ? `\n${cause.stderrTail.trim().split('\n').slice(-6).join('\n')}` : '';
        throw new TranscriptionError(`whisper.cpp failed on ${audioPath}${detail}`, { cause });
    }
    const jsonPath = `${outputBase}.json`;
    let raw;
    try {
        raw = await readFile(jsonPath, 'utf8');
    }
    catch (cause) {
        throw new TranscriptionError(`whisper.cpp did not write expected output at ${jsonPath}`, { cause });
    }
    finally {
        await rm(jsonPath, { force: true }).catch(() => { });
    }
    return parseWhisperJson(raw, language === 'auto' ? 'unknown' : language);
}
//# sourceMappingURL=whisper.js.map