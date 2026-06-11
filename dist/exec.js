import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
/** Cap on captured output per stream; older bytes are discarded (we only ever need the tail for errors). */
const DEFAULT_CAPTURE_LIMIT = 256 * 1024;
export class ExecError extends Error {
    command;
    exitCode;
    stderrTail;
    constructor(command, exitCode, stderrTail) {
        super(`${command} exited with code ${exitCode}${stderrTail ? `:\n${stderrTail.trim()}` : ''}`);
        this.command = command;
        this.exitCode = exitCode;
        this.stderrTail = stderrTail;
        this.name = 'ExecError';
    }
}
class TailBuffer {
    limit;
    chunks = [];
    size = 0;
    constructor(limit) {
        this.limit = limit;
    }
    push(chunk) {
        this.chunks.push(chunk);
        this.size += chunk.length;
        while (this.size > this.limit && this.chunks.length > 1) {
            const dropped = this.chunks.shift();
            this.size -= dropped.length;
        }
    }
    toString() {
        return Buffer.concat(this.chunks).toString('utf8');
    }
}
function combineSignals(signal, timeoutMs) {
    const signals = [];
    if (signal)
        signals.push(signal);
    if (timeoutMs && timeoutMs > 0)
        signals.push(AbortSignal.timeout(timeoutMs));
    if (signals.length === 0)
        return undefined;
    return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}
/**
 * Run a binary (no shell) and capture bounded output.
 * Rejects with ExecError on non-zero exit, or the abort/timeout reason on abort.
 */
export function exec(command, args, options = {}) {
    const { onLine, captureLimit = DEFAULT_CAPTURE_LIMIT } = options;
    const signal = combineSignals(options.signal, options.timeoutMs);
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            ...(signal ? { signal } : {}),
        });
        const out = new TailBuffer(captureLimit);
        const err = new TailBuffer(captureLimit);
        const remainders = { stdout: '', stderr: '' };
        const feedLines = (stream, chunk) => {
            if (!onLine)
                return;
            const text = remainders[stream] + chunk.toString('utf8');
            const lines = text.split(/\r\n|\r|\n/);
            remainders[stream] = lines.pop() ?? '';
            for (const line of lines) {
                if (line.length > 0)
                    onLine(line, stream);
            }
        };
        child.stdout.on('data', (chunk) => {
            out.push(chunk);
            feedLines('stdout', chunk);
        });
        child.stderr.on('data', (chunk) => {
            err.push(chunk);
            feedLines('stderr', chunk);
        });
        child.on('error', (cause) => reject(cause));
        child.on('close', (code) => {
            for (const stream of ['stdout', 'stderr']) {
                if (onLine && remainders[stream].length > 0)
                    onLine(remainders[stream], stream);
            }
            if (code === 0) {
                resolve({ stdout: out.toString(), stderr: err.toString() });
            }
            else {
                reject(new ExecError(command, code, err.toString()));
            }
        });
    });
}
function isExecutable(path) {
    try {
        accessSync(path, constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Find the first usable binary among `candidates` on PATH (plus common Homebrew
 * locations on macOS). An explicit `override` is returned as-is.
 */
export function findBinary(candidates, override) {
    if (override)
        return override;
    const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
    if (process.platform === 'darwin') {
        for (const extra of ['/opt/homebrew/bin', '/usr/local/bin']) {
            if (!dirs.includes(extra))
                dirs.push(extra);
        }
    }
    for (const name of candidates) {
        if (isAbsolute(name) || name.includes('/')) {
            if (isExecutable(name))
                return name;
            continue;
        }
        const names = process.platform === 'win32' ? [`${name}.exe`, name] : [name];
        for (const dir of dirs) {
            for (const n of names) {
                const full = join(dir, n);
                if (isExecutable(full))
                    return full;
            }
        }
    }
    return null;
}
//# sourceMappingURL=exec.js.map