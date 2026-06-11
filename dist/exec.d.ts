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
export declare class ExecError extends Error {
    readonly command: string;
    readonly exitCode: number | null;
    readonly stderrTail: string;
    constructor(command: string, exitCode: number | null, stderrTail: string);
}
/**
 * Run a binary (no shell) and capture bounded output.
 * Rejects with ExecError on non-zero exit, or the abort/timeout reason on abort.
 */
export declare function exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
/**
 * Find the first usable binary among `candidates` on PATH (plus common Homebrew
 * locations on macOS). An explicit `override` is returned as-is.
 */
export declare function findBinary(candidates: string[], override?: string): string | null;
//# sourceMappingURL=exec.d.ts.map