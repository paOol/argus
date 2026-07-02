export type ArgusErrorCode = 'UNSUPPORTED_URL' | 'MISSING_BINARY' | 'DOWNLOAD_FAILED' | 'NO_VIDEO' | 'AUDIO_EXTRACTION_FAILED' | 'MODEL_FETCH_FAILED' | 'TRANSCRIPTION_FAILED' | 'ABORTED';
export declare class ArgusError extends Error {
    readonly code: ArgusErrorCode;
    constructor(code: ArgusErrorCode, message: string, options?: ErrorOptions);
}
export declare class UnsupportedUrlError extends ArgusError {
    constructor(url: string, reason?: string);
}
export declare class MissingBinaryError extends ArgusError {
    readonly binary: string;
    readonly installHint: string;
    constructor(binary: string, installHint: string);
}
export declare class DownloadError extends ArgusError {
    constructor(message: string, options?: ErrorOptions);
}
/**
 * The link resolved to a post that exists but holds no video (e.g. an
 * Instagram photo post). When the post carries images, their direct CDN URLs
 * are attached so callers can handle the media some other way.
 */
export declare class NoVideoError extends ArgusError {
    readonly imageUrls: string[];
    constructor(message: string, imageUrls?: string[]);
}
export declare class AudioExtractionError extends ArgusError {
    constructor(message: string, options?: ErrorOptions);
}
export declare class ModelFetchError extends ArgusError {
    constructor(message: string, options?: ErrorOptions);
}
export declare class TranscriptionError extends ArgusError {
    constructor(message: string, options?: ErrorOptions);
}
//# sourceMappingURL=errors.d.ts.map