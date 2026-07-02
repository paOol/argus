# argus

Local-first video transcription for Node.js. Give it a **YouTube**, **Instagram**, **Xiaohongshu**, **Telegram**, **Reddit**, or **Twitter/X** video link and get back a text transcript — using only tools running on your machine. **No third-party APIs**, no keys, no cloud.

```
URL ──▶ download (audio-only when possible) ──▶ ffmpeg (strip → 16 kHz mono WAV) ──▶ whisper.cpp ──▶ transcript
```

- **Zero runtime npm dependencies.** The library is a thin, careful orchestrator around three battle-tested local tools.
- **Lean by design.** Downloads audio-only streams when the site offers them, deletes the source media the moment the WAV exists, streams downloads to disk (nothing is buffered in RAM), and defaults to a quantized ~60 MB whisper model.
- **Telegram support without yt-dlp.** Public `t.me/<channel>/<id>` posts are resolved through Telegram's embed page with plain `fetch` — no bot token, no MTProto, no API.
- **Reddit support without an account.** Post pages are fetched with plain `fetch` (answering Reddit's lightweight bot check in-process), and ffmpeg pulls just the audio track from the `v.redd.it` stream — no Reddit API, no login, no yt-dlp.
- **Twitter/X support without login.** Tweets are resolved through Twitter's public embed (syndication) endpoint with plain `fetch`, and ffmpeg pulls just the audio rendition of the HLS stream — no API keys, no account, no yt-dlp.

## Install

Not published to npm — install straight from GitHub (`dist/` is committed, so no build step is required on install):

```sh
npm install github:paOol/argus
# or
yarn add paOol/argus
```

## Requirements

Three local binaries on your `PATH` (checked at runtime with friendly errors; run `argus doctor` to verify):

| Tool                                                   | Used for                                      | macOS install              |
| ------------------------------------------------------ | --------------------------------------------- | -------------------------- |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp)             | YouTube / Xiaohongshu (and 1800+ other sites) | `brew install yt-dlp`      |
| [ffmpeg](https://ffmpeg.org)                           | Stripping + resampling audio                  | `brew install ffmpeg`      |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | On-device speech-to-text                      | `brew install whisper-cpp` |

Node.js ≥ 20.3.

> The whisper _model_ (a ggml `.bin` file) is downloaded once from the official whisper.cpp model collection and cached in `~/.cache/argus/models`. That is a static file download — the same as installing software — not an inference API. For fully offline use, pre-place the file there or pass `model: '/path/to/ggml-base.bin'`.

## Usage

### Library

```ts
import { transcribe } from 'argus-transcribe';

const result = await transcribe('https://www.youtube.com/watch?v=jNQXAC9IVRw');

console.log(result.text); // full transcript
console.log(result.language); // detected language, e.g. "en"
console.log(result.segments); // [{ start: 0, end: 2.5, text: "..." }, ...]
```

All platforms work the same way:

```ts
await transcribe('https://youtu.be/jNQXAC9IVRw'); // YouTube (incl. Shorts)
await transcribe('https://www.instagram.com/reel/C1234abcd/'); // Instagram
await transcribe('https://www.xiaohongshu.com/explore/65f1a2b3…'); // Xiaohongshu
await transcribe('https://www.rednote.com/explore/65f1a2b3…'); // …or its new rednote.com domain
await transcribe('http://xhslink.com/a/AbCdEf'); // XHS share short-links
await transcribe('https://t.me/somechannel/123'); // public Telegram posts
await transcribe('https://www.reddit.com/r/funny/comments/abc123/title/'); // Reddit video posts
await transcribe('https://x.com/jack/status/20'); // Twitter/X tweets
```

Options:

```ts
await transcribe(url, {
  model: 'small', // default: 'base-q5_1' (~60 MB). 'small'/'small-q5_1' is
  // noticeably better for Mandarin (Xiaohongshu) content.
  language: 'zh', // default: auto-detect
  threads: 8, // whisper.cpp threads
  keepAudio: true, // keep the 16 kHz WAV, returned as result.audioPath
  modelDir: '/opt/models', // model cache location (or $ARGUS_MODEL_DIR)
  cookiesFromBrowser: 'chrome', // for login-gated Instagram posts (passed to yt-dlp)
  timeoutMs: 10 * 60_000, // per-step timeout
  signal: abortController.signal, // cancel everything
  onProgress: (e) => console.error(e.stage, e.percent ?? '', e.message ?? '')
});
```

Already have a file (e.g. saved from a private Telegram chat)? Skip the download:

```ts
import { transcribeFile } from 'argus-transcribe';
const { text } = await transcribeFile('./saved-video.mp4', { language: 'zh' });
```

Other exports: `detectPlatform(url)`, `checkDependencies()`, `toSrt(segments)`, `toVtt(segments)`, `toTimestampedText(segments)`, typed errors (`UnsupportedUrlError`, `MissingBinaryError`, `DownloadError`, `NoVideoError`, `AudioExtractionError`, `ModelFetchError`, `TranscriptionError` — all with a stable `.code`).

When a link points at an image post instead of a video (e.g. an Instagram photo), `transcribe` throws `NoVideoError` (code `NO_VIDEO`) with the direct image URL(s) attached, so callers can handle the picture some other way:

```ts
import { transcribe, NoVideoError } from 'argus-transcribe';
try {
  const { text } = await transcribe(url);
} catch (err) {
  if (err instanceof NoVideoError) {
    console.log('Image post:', err.imageUrls); // highest-res CDN URL per photo
  } else throw err;
}
```

The CLI does the same: it prints the image URL(s) to stdout, one per line, and exits with code `3` (vs `1` for real failures).

### CLI

```sh
argus doctor                                            # verify yt-dlp / ffmpeg / whisper.cpp
argus https://www.youtube.com/watch?v=jNQXAC9IVRw       # transcript to stdout
argus https://t.me/somechannel/123 -f srt -o out.srt    # subtitles
argus https://www.xiaohongshu.com/explore/… -m small -l zh
argus <url> -f json                                     # full result as JSON
argus <url> -f timestamps                               # [mm:ss]-prefixed lines
```

## Model cheat sheet

| Model                 | Disk   | Notes                                       |
| --------------------- | ------ | ------------------------------------------- |
| `tiny-q5_1`           | 31 MB  | fastest, rough                              |
| `base-q5_1`           | 60 MB  | **default** — good English, OK multilingual |
| `small-q5_1`          | 190 MB | solid multilingual (recommended for zh)     |
| `medium-q5_0`         | 539 MB | high quality                                |
| `large-v3-turbo-q5_0` | 574 MB | near-best quality, fast for its size        |

Any whisper.cpp ggml model name or local `.bin` path works.

## Platform notes

- **YouTube** — audio-only stream is downloaded (a few MB per minute, no video bytes). Shorts, `youtu.be`, music, and embed links all work.
- **Instagram** — Reel/post/carousel links (`/reel/<code>`, `/p/<code>`, `/tv/<code>`, and `/share/...` links, which are redirect-resolved). Instagram blocks yt-dlp's anonymous access these days, so argus runs the same persisted GraphQL query Instagram's own logged-out web player uses and downloads just the audio-only DASH track (~60 kbps). Instagram rotates that query's `doc_id` every few weeks; when that happens argus re-harvests the current id from Instagram's JS bundles automatically and caches it in `~/.cache/argus/`. For private or login-gated posts pass `cookiesFromBrowser` to fall back to yt-dlp with your account. Photo posts (no video anywhere in the post) throw `NoVideoError` carrying the image URL(s) — the CLI prints them to stdout and exits with code 3.
- **Xiaohongshu / RedNote** — `xiaohongshu.com/explore/...` links, the new `rednote.com` domain (rewritten to the original domain for yt-dlp), and `xhslink.com` share short-links (redirects are resolved, including recovery of note URLs from XHS's bot-wall `/404?...redirectPath=` bounces). Note: XHS links generally need a fresh `xsec_token` query param — copy links via the app/web "Share" button; old links expire and are reported as such.
- **Telegram** — public channel posts only (`t.me/<channel>/<id>`, `t.me/s/...` also accepted). Private `t.me/c/...` links have no public embed; save the file with a Telegram client and use `transcribeFile()`. Very large videos may not be served via Telegram's web embed.
- **Reddit** — post links (`reddit.com/r/<sub>/comments/<id>/...`), in-app share links (`/r/<sub>/s/<token>`), and `redd.it` / `v.redd.it` short links. yt-dlp's anonymous Reddit access is blocked these days, so argus fetches the post page itself, answers Reddit's JS bot check, and has ffmpeg download only the audio rendition of the `v.redd.it` HLS stream. Reddit-hosted videos only (text/image posts and external-link posts won't work); for private or quarantined subreddits pass `cookiesFromBrowser` to fall back to yt-dlp with your account.
- **Twitter / X** — tweet links (`x.com/<user>/status/<id>`, `twitter.com/...`, `mobile.twitter.com/...`, and `/i/web/status/<id>`). The tweet is resolved through Twitter's public syndication endpoint (the same one embedded tweets use — no auth, no API key), and ffmpeg downloads only the audio rendition of the HLS stream. Public tweets with native video only; for protected or age-gated tweets pass `cookiesFromBrowser` to fall back to yt-dlp with your account.
- **Anything else** — unknown hosts are passed to yt-dlp, which supports most video sites; they're reported as platform `generic`.

## Leanness

- Audio-only downloads where the platform offers them (`bestaudio`), full video only as a fallback.
- All network downloads stream straight to disk; subprocess output capture is capped, so memory stays flat regardless of video length.
- Source media is deleted as soon as audio is extracted; the whole per-job temp dir is removed on success _and_ failure.
- 16 kHz mono WAV ≈ 1.9 MB/min — a 10-minute video peaks at well under 100 MB of scratch disk.
- whisper.cpp with the default quantized `base` model uses a few hundred MB of RAM while transcribing; the Node process itself stays tiny since all heavy lifting is in subprocesses.

## Development

```sh
npm install
npm test          # unit tests (no network needed)
npm run build     # emits dist/
```
