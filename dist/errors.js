export class ArgusError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.name = new.target.name;
        this.code = code;
    }
}
export class UnsupportedUrlError extends ArgusError {
    constructor(url, reason) {
        super('UNSUPPORTED_URL', `Unsupported URL: ${url}${reason ? ` (${reason})` : ''}`);
    }
}
export class MissingBinaryError extends ArgusError {
    binary;
    installHint;
    constructor(binary, installHint) {
        super('MISSING_BINARY', `Required binary "${binary}" was not found on PATH. ${installHint}`);
        this.binary = binary;
        this.installHint = installHint;
    }
}
export class DownloadError extends ArgusError {
    constructor(message, options) {
        super('DOWNLOAD_FAILED', message, options);
    }
}
/**
 * The link resolved to a post that exists but holds no video (e.g. an
 * Instagram photo post). When the post carries images, their direct CDN URLs
 * are attached so callers can handle the media some other way.
 */
export class NoVideoError extends ArgusError {
    imageUrls;
    constructor(message, imageUrls = []) {
        super('NO_VIDEO', message);
        this.imageUrls = imageUrls;
    }
}
export class AudioExtractionError extends ArgusError {
    constructor(message, options) {
        super('AUDIO_EXTRACTION_FAILED', message, options);
    }
}
export class ModelFetchError extends ArgusError {
    constructor(message, options) {
        super('MODEL_FETCH_FAILED', message, options);
    }
}
export class TranscriptionError extends ArgusError {
    constructor(message, options) {
        super('TRANSCRIPTION_FAILED', message, options);
    }
}
//# sourceMappingURL=errors.js.map