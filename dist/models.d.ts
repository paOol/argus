import type { ProgressEvent } from './types.js';
export declare const KNOWN_MODELS: readonly ["tiny", "tiny.en", "tiny-q5_1", "tiny.en-q5_1", "tiny-q8_0", "base", "base.en", "base-q5_1", "base.en-q5_1", "base-q8_0", "small", "small.en", "small-q5_1", "small.en-q5_1", "small-q8_0", "medium", "medium.en", "medium-q5_0", "medium.en-q5_0", "medium-q8_0", "large-v1", "large-v2", "large-v2-q5_0", "large-v2-q8_0", "large-v3", "large-v3-q5_0", "large-v3-turbo", "large-v3-turbo-q5_0", "large-v3-turbo-q8_0"];
export declare const DEFAULT_MODEL = "base-q5_1";
export declare function defaultModelDir(): string;
/** Map a model name to its ggml file name, e.g. "base-q5_1" -> "ggml-base-q5_1.bin". */
export declare function modelFileName(model: string): string;
/** True when the model option is a path to a .bin file rather than a model name. */
export declare function isModelPath(model: string): boolean;
export interface ResolveModelOptions {
    modelDir?: string | undefined;
    signal?: AbortSignal | undefined;
    onProgress?: ((event: ProgressEvent) => void) | undefined;
}
/**
 * Resolve a model name or path to a local ggml file, downloading it into the
 * cache directory on first use.
 */
export declare function resolveModel(model: string, options?: ResolveModelOptions): Promise<string>;
//# sourceMappingURL=models.d.ts.map