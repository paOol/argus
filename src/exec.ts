import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

/** Cap on captured output per stream; older bytes are discarded (we only ever need the tail for errors). */
const DEFAULT_CAPTURE_LIMIT = 256 * 1024;

export interface ExecOptions {
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  /** Called once per complete line on either stream. Lines split on \n and \r so progress carriage returns work. */
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
  captureLimit?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export class ExecError extends Error {
  constructor(
    readonly command: string,
    readonly exitCode: number | null,
    readonly stderrTail: string,
  ) {
    super(`${command} exited with code ${exitCode}${stderrTail ? `:\n${stderrTail.trim()}` : ''}`);
    this.name = 'ExecError';
  }
}

class TailBuffer {
  private chunks: Buffer[] = [];
  private size = 0;
  constructor(private readonly limit: number) {}

  push(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
    while (this.size > this.limit && this.chunks.length > 1) {
      const dropped = this.chunks.shift()!;
      this.size -= dropped.length;
    }
  }

  toString(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

function combineSignals(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): AbortSignal | undefined {
  const signals: AbortSignal[] = [];
  if (signal) signals.push(signal);
  if (timeoutMs && timeoutMs > 0) signals.push(AbortSignal.timeout(timeoutMs));
  if (signals.length === 0) return undefined;
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

/**
 * Run a binary (no shell) and capture bounded output.
 * Rejects with ExecError on non-zero exit, or the abort/timeout reason on abort.
 */
export function exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  const { onLine, captureLimit = DEFAULT_CAPTURE_LIMIT } = options;
  const signal = combineSignals(options.signal, options.timeoutMs);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(signal ? { signal } : {}),
    });

    const out = new TailBuffer(captureLimit);
    const err = new TailBuffer(captureLimit);
    const remainders: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };

    const feedLines = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
      if (!onLine) return;
      const text = remainders[stream] + chunk.toString('utf8');
      const lines = text.split(/\r\n|\r|\n/);
      remainders[stream] = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length > 0) onLine(line, stream);
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      out.push(chunk);
      feedLines('stdout', chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err.push(chunk);
      feedLines('stderr', chunk);
    });

    child.on('error', (cause) => reject(cause));
    child.on('close', (code) => {
      for (const stream of ['stdout', 'stderr'] as const) {
        if (onLine && remainders[stream].length > 0) onLine(remainders[stream], stream);
      }
      if (code === 0) {
        resolve({ stdout: out.toString(), stderr: err.toString() });
      } else {
        reject(new ExecError(command, code, err.toString()));
      }
    });
  });
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the first usable binary among `candidates` on PATH (plus common Homebrew
 * locations on macOS). An explicit `override` is returned as-is.
 */
export function findBinary(candidates: string[], override?: string): string | null {
  if (override) return override;

  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  if (process.platform === 'darwin') {
    for (const extra of ['/opt/homebrew/bin', '/usr/local/bin']) {
      if (!dirs.includes(extra)) dirs.push(extra);
    }
  }

  for (const name of candidates) {
    if (isAbsolute(name) || name.includes('/')) {
      if (isExecutable(name)) return name;
      continue;
    }
    const names = process.platform === 'win32' ? [`${name}.exe`, name] : [name];
    for (const dir of dirs) {
      for (const n of names) {
        const full = join(dir, n);
        if (isExecutable(full)) return full;
      }
    }
  }
  return null;
}
