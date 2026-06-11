import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ModelFetchError } from './errors.js';
/**
 * ggml model files are fetched once from the official whisper.cpp model
 * collection (a static file host, not an inference API) and cached locally.
 * Fully offline use: pre-place the .bin in the model dir or pass a file path.
 */
const MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
export const KNOWN_MODELS = [
    'tiny', 'tiny.en', 'tiny-q5_1', 'tiny.en-q5_1', 'tiny-q8_0',
    'base', 'base.en', 'base-q5_1', 'base.en-q5_1', 'base-q8_0',
    'small', 'small.en', 'small-q5_1', 'small.en-q5_1', 'small-q8_0',
    'medium', 'medium.en', 'medium-q5_0', 'medium.en-q5_0', 'medium-q8_0',
    'large-v1',
    'large-v2', 'large-v2-q5_0', 'large-v2-q8_0',
    'large-v3', 'large-v3-q5_0',
    'large-v3-turbo', 'large-v3-turbo-q5_0', 'large-v3-turbo-q8_0',
];
export const DEFAULT_MODEL = 'base-q5_1';
export function defaultModelDir() {
    if (process.env.ARGUS_MODEL_DIR)
        return process.env.ARGUS_MODEL_DIR;
    const cacheHome = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
    return join(cacheHome, 'argus', 'models');
}
/** Map a model name to its ggml file name, e.g. "base-q5_1" -> "ggml-base-q5_1.bin". */
export function modelFileName(model) {
    return `ggml-${model}.bin`;
}
/** True when the model option is a path to a .bin file rather than a model name. */
export function isModelPath(model) {
    return model.endsWith('.bin') || isAbsolute(model) || model.includes('/') || model.includes('\\');
}
async function exists(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Resolve a model name or path to a local ggml file, downloading it into the
 * cache directory on first use.
 */
export async function resolveModel(model, options = {}) {
    if (isModelPath(model)) {
        if (!(await exists(model))) {
            throw new ModelFetchError(`Model file not found: ${model}`);
        }
        return model;
    }
    const dir = options.modelDir ?? defaultModelDir();
    const filePath = join(dir, modelFileName(model));
    if (await exists(filePath))
        return filePath;
    const url = `${MODEL_BASE_URL}/${modelFileName(model)}`;
    const emit = options.onProgress ?? (() => { });
    emit({ stage: 'fetch-model', message: `Downloading whisper model "${model}" (one-time, cached in ${dir})` });
    await mkdir(dir, { recursive: true });
    const partPath = `${filePath}.part`;
    let response;
    try {
        response = await fetch(url, options.signal ? { signal: options.signal } : {});
    }
    catch (cause) {
        throw new ModelFetchError(`Failed to download model "${model}" from ${url}`, { cause });
    }
    if (!response.ok || !response.body) {
        const hint = response.status === 404
            ? ` Unknown model name. Known models: ${KNOWN_MODELS.join(', ')}`
            : '';
        throw new ModelFetchError(`Model download failed with HTTP ${response.status} for ${url}.${hint}`);
    }
    const total = Number(response.headers.get('content-length')) || 0;
    let received = 0;
    let lastEmitted = -1;
    const counter = new TransformStream({
        transform(chunk, controller) {
            received += chunk.byteLength;
            if (total > 0) {
                const percent = Math.min(100, Math.floor((received / total) * 100));
                if (percent !== lastEmitted) {
                    lastEmitted = percent;
                    emit({ stage: 'fetch-model', percent });
                }
            }
            controller.enqueue(chunk);
        },
    });
    try {
        await pipeline(Readable.fromWeb(response.body.pipeThrough(counter)), createWriteStream(partPath), ...(options.signal ? [{ signal: options.signal }] : []));
        await rename(partPath, filePath);
    }
    catch (cause) {
        await rm(partPath, { force: true }).catch(() => { });
        throw new ModelFetchError(`Failed to download model "${model}" from ${url}`, { cause });
    }
    return filePath;
}
//# sourceMappingURL=models.js.map