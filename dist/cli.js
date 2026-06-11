#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { toSrt, toTimestampedText, toVtt } from './format.js';
import { ArgusError } from './errors.js';
import { checkDependencies, transcribe } from './index.js';
import { DEFAULT_MODEL, KNOWN_MODELS } from './models.js';
const HELP = `argus — local-first video transcription (no third-party APIs)

Usage:
  argus <url> [options]      Transcribe a video link
  argus doctor               Check that yt-dlp, ffmpeg, and whisper.cpp are installed

Supported links: YouTube, Instagram, Xiaohongshu (incl. xhslink.com),
public Telegram posts (t.me/<channel>/<id>), plus any other site yt-dlp knows.

Options:
  -m, --model <name|path>    Whisper model (default: ${DEFAULT_MODEL}).
                             Use "small" or "small-q5_1" for better non-English results.
  -l, --language <code>      Force language (e.g. zh, en). Default: auto-detect.
  -o, --output <file>        Write the transcript to a file instead of stdout.
  -f, --format <fmt>         Output format: text | timestamps | json | srt | vtt (default: text)
      --keep-audio           Keep the extracted 16 kHz WAV and print its path.
      --model-dir <dir>      Where to cache models (default: ~/.cache/argus/models).
      --threads <n>          whisper.cpp thread count.
      --cookies-from-browser <browser>
                             Read site cookies from a browser (chrome, firefox, safari, ...).
                             Needed for login-gated Instagram posts.
      --timeout <seconds>    Per-step timeout.
      --yt-dlp <path>        Explicit yt-dlp binary.
      --ffmpeg <path>        Explicit ffmpeg binary.
      --whisper <path>       Explicit whisper.cpp binary.
  -q, --quiet                No progress output.
  -h, --help                 Show this help.

Examples:
  argus https://www.youtube.com/watch?v=dQw4w9WgXcQ
  argus https://t.me/durov/123 -f srt -o out.srt
  argus https://www.xiaohongshu.com/explore/... -m small -l zh
`;
export function parseArgs(argv) {
    const flags = { format: 'text', keepAudio: false, quiet: false, doctor: false, help: false };
    const takeValue = (name, next) => {
        if (next === undefined)
            throw new Error(`Missing value for ${name}`);
        return next;
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '-h':
            case '--help':
                flags.help = true;
                break;
            case '-q':
            case '--quiet':
                flags.quiet = true;
                break;
            case '--keep-audio':
                flags.keepAudio = true;
                break;
            case '-m':
            case '--model':
                flags.model = takeValue(arg, argv[++i]);
                break;
            case '-l':
            case '--language':
                flags.language = takeValue(arg, argv[++i]);
                break;
            case '-o':
            case '--output':
                flags.output = takeValue(arg, argv[++i]);
                break;
            case '--model-dir':
                flags.modelDir = takeValue(arg, argv[++i]);
                break;
            case '--threads':
                flags.threads = Number(takeValue(arg, argv[++i]));
                break;
            case '--cookies-from-browser':
                flags.cookiesFromBrowser = takeValue(arg, argv[++i]);
                break;
            case '--timeout':
                flags.timeoutSeconds = Number(takeValue(arg, argv[++i]));
                break;
            case '--yt-dlp':
                flags.ytDlp = takeValue(arg, argv[++i]);
                break;
            case '--ffmpeg':
                flags.ffmpeg = takeValue(arg, argv[++i]);
                break;
            case '--whisper':
                flags.whisper = takeValue(arg, argv[++i]);
                break;
            case '-f':
            case '--format': {
                const value = takeValue(arg, argv[++i]);
                if (!['text', 'timestamps', 'json', 'srt', 'vtt'].includes(value)) {
                    throw new Error(`Unknown format "${value}" (expected text, timestamps, json, srt, or vtt)`);
                }
                flags.format = value;
                break;
            }
            case 'doctor':
                flags.doctor = true;
                break;
            default:
                if (arg.startsWith('-'))
                    throw new Error(`Unknown option ${arg}`);
                if (flags.url)
                    throw new Error(`Unexpected extra argument "${arg}"`);
                flags.url = arg;
        }
    }
    return flags;
}
function renderProgress(event) {
    const label = event.message ?? event.stage;
    const percent = event.percent !== undefined ? ` ${event.percent.toFixed(0)}%` : '';
    if (process.stderr.isTTY) {
        process.stderr.write(`\r\x1b[2K${label}${percent}`);
    }
    else if (event.percent === undefined) {
        process.stderr.write(`${label}\n`);
    }
}
async function runDoctor() {
    const report = await checkDependencies();
    const rows = [
        ['yt-dlp', report.ytDlp, 'brew install yt-dlp'],
        ['ffmpeg', report.ffmpeg, 'brew install ffmpeg'],
        ['whisper.cpp', report.whisper, 'brew install whisper-cpp'],
    ];
    for (const [name, status, hint] of rows) {
        if (status.found) {
            console.log(`✓ ${name.padEnd(12)} ${status.path}${status.version ? `  (${status.version})` : ''}`);
        }
        else {
            console.log(`✗ ${name.padEnd(12)} not found — try: ${hint}`);
        }
    }
    console.log(report.ok ? '\nAll dependencies found.' : '\nSome dependencies are missing.');
    return report.ok ? 0 : 1;
}
export async function main(argv = process.argv.slice(2)) {
    let flags;
    try {
        flags = parseArgs(argv);
    }
    catch (error) {
        console.error(`Error: ${error.message}\n`);
        console.error(HELP);
        return 2;
    }
    if (flags.help || (!flags.url && !flags.doctor)) {
        console.log(HELP);
        return flags.help ? 0 : 2;
    }
    if (flags.doctor)
        return runDoctor();
    if (flags.model && !flags.model.includes('/') && !flags.model.endsWith('.bin') && !KNOWN_MODELS.includes(flags.model)) {
        console.error(`Warning: "${flags.model}" is not a known model name; attempting anyway.`);
    }
    const options = {
        keepAudio: flags.keepAudio,
        ...(flags.model !== undefined ? { model: flags.model } : {}),
        ...(flags.language !== undefined ? { language: flags.language } : {}),
        ...(flags.modelDir !== undefined ? { modelDir: flags.modelDir } : {}),
        ...(flags.threads !== undefined ? { threads: flags.threads } : {}),
        ...(flags.cookiesFromBrowser !== undefined ? { cookiesFromBrowser: flags.cookiesFromBrowser } : {}),
        ...(flags.timeoutSeconds !== undefined ? { timeoutMs: flags.timeoutSeconds * 1000 } : {}),
        ...(flags.ytDlp || flags.ffmpeg || flags.whisper
            ? {
                binaries: {
                    ...(flags.ytDlp !== undefined ? { ytDlp: flags.ytDlp } : {}),
                    ...(flags.ffmpeg !== undefined ? { ffmpeg: flags.ffmpeg } : {}),
                    ...(flags.whisper !== undefined ? { whisper: flags.whisper } : {}),
                },
            }
            : {}),
        ...(flags.quiet ? {} : { onProgress: renderProgress }),
    };
    try {
        const result = await transcribe(flags.url, options);
        if (!flags.quiet && process.stderr.isTTY)
            process.stderr.write('\r\x1b[2K');
        let rendered;
        switch (flags.format) {
            case 'json':
                rendered = JSON.stringify(result, null, 2);
                break;
            case 'srt':
                rendered = toSrt(result.segments);
                break;
            case 'vtt':
                rendered = toVtt(result.segments);
                break;
            case 'timestamps':
                rendered = toTimestampedText(result.segments);
                break;
            default: rendered = result.text;
        }
        if (flags.output) {
            await writeFile(flags.output, rendered + '\n', 'utf8');
            if (!flags.quiet)
                console.error(`Wrote ${flags.format} transcript to ${flags.output}`);
        }
        else {
            console.log(rendered);
        }
        if (result.audioPath)
            console.error(`Kept audio at ${result.audioPath}`);
        return 0;
    }
    catch (error) {
        if (!flags.quiet && process.stderr.isTTY)
            process.stderr.write('\r\x1b[2K');
        if (error instanceof ArgusError) {
            console.error(`Error (${error.code}): ${error.message}`);
        }
        else {
            console.error(`Error: ${error?.stack ?? error}`);
        }
        return 1;
    }
}
let invokedDirectly = false;
if (process.argv[1]) {
    try {
        invokedDirectly = import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
    }
    catch {
        invokedDirectly = false;
    }
}
if (invokedDirectly) {
    main().then((code) => {
        process.exitCode = code;
    });
}
//# sourceMappingURL=cli.js.map