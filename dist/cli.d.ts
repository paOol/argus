#!/usr/bin/env node
interface CliFlags {
    url?: string;
    model?: string;
    language?: string;
    output?: string;
    format: 'text' | 'timestamps' | 'json' | 'srt' | 'vtt';
    keepAudio: boolean;
    modelDir?: string;
    threads?: number;
    cookiesFromBrowser?: string;
    cookiesFile?: string;
    timeoutSeconds?: number;
    ytDlp?: string;
    ffmpeg?: string;
    whisper?: string;
    quiet: boolean;
    doctor: boolean;
    help: boolean;
}
export declare function parseArgs(argv: string[]): CliFlags;
export declare function main(argv?: string[]): Promise<number>;
export {};
//# sourceMappingURL=cli.d.ts.map