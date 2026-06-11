import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { MissingBinaryError, TranscriptionError } from './errors.js';
import { ExecError, exec, findBinary } from './exec.js';
import type { ProgressEvent, TranscriptSegment } from './types.js';

export const WHISPER_INSTALL_HINT =
  'Install whisper.cpp with `brew install whisper-cpp` (macOS) or build it from https://github.com/ggml-org/whisper.cpp';

/** Binary names across whisper.cpp versions/packagings, newest first. */
const WHISPER_BINARY_CANDIDATES = ['whisper-cli', 'whisper-cpp', 'whisper.cpp', 'main'];

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

interface WhisperJson {
  result?: { language?: string };
  transcription?: Array<{
    offsets?: { from?: number; to?: number };
    text?: string;
  }>;
}

/** Parse whisper.cpp's -oj JSON output. Exported for unit testing. */
export function parseWhisperJson(raw: string, fallbackLanguage: string): WhisperOutput {
  let json: WhisperJson;
  try {
    json = JSON.parse(raw) as WhisperJson;
  } catch (cause) {
    throw new TranscriptionError('whisper.cpp produced unparseable JSON output', { cause });
  }

  const segments: TranscriptSegment[] = (json.transcription ?? [])
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

export function findWhisperBinary(override?: string): string | null {
  return findBinary(WHISPER_BINARY_CANDIDATES, override);
}

/** Run whisper.cpp on a 16 kHz mono WAV file and return the parsed transcript. */
export async function runWhisper(audioPath: string, modelPath: string, options: RunWhisperOptions): Promise<WhisperOutput> {
  const whisper = findWhisperBinary(options.whisperPath);
  if (!whisper) throw new MissingBinaryError('whisper-cli', WHISPER_INSTALL_HINT);

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
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && (cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new MissingBinaryError('whisper-cli', WHISPER_INSTALL_HINT);
    }
    const detail = cause instanceof ExecError ? `\n${cause.stderrTail.trim().split('\n').slice(-6).join('\n')}` : '';
    throw new TranscriptionError(`whisper.cpp failed on ${audioPath}${detail}`, { cause });
  }

  const jsonPath = `${outputBase}.json`;
  let raw: string;
  try {
    raw = await readFile(jsonPath, 'utf8');
  } catch (cause) {
    throw new TranscriptionError(`whisper.cpp did not write expected output at ${jsonPath}`, { cause });
  } finally {
    await rm(jsonPath, { force: true }).catch(() => {});
  }

  return parseWhisperJson(raw, language === 'auto' ? 'unknown' : language);
}
