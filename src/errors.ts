export type ArgusErrorCode =
  | 'UNSUPPORTED_URL'
  | 'MISSING_BINARY'
  | 'DOWNLOAD_FAILED'
  | 'NO_VIDEO'
  | 'AUDIO_EXTRACTION_FAILED'
  | 'MODEL_FETCH_FAILED'
  | 'TRANSCRIPTION_FAILED'
  | 'ABORTED';

export class ArgusError extends Error {
  readonly code: ArgusErrorCode;

  constructor(code: ArgusErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class UnsupportedUrlError extends ArgusError {
  constructor(url: string, reason?: string) {
    super('UNSUPPORTED_URL', `Unsupported URL: ${url}${reason ? ` (${reason})` : ''}`);
  }
}

export class MissingBinaryError extends ArgusError {
  readonly binary: string;
  readonly installHint: string;

  constructor(binary: string, installHint: string) {
    super('MISSING_BINARY', `Required binary "${binary}" was not found on PATH. ${installHint}`);
    this.binary = binary;
    this.installHint = installHint;
  }
}

export class DownloadError extends ArgusError {
  constructor(message: string, options?: ErrorOptions) {
    super('DOWNLOAD_FAILED', message, options);
  }
}

/**
 * The link resolved to a post that exists but holds no video (e.g. an
 * Instagram photo post). When the post carries images, their direct CDN URLs
 * are attached so callers can handle the media some other way.
 */
export class NoVideoError extends ArgusError {
  readonly imageUrls: string[];

  constructor(message: string, imageUrls: string[] = []) {
    super('NO_VIDEO', message);
    this.imageUrls = imageUrls;
  }
}

export class AudioExtractionError extends ArgusError {
  constructor(message: string, options?: ErrorOptions) {
    super('AUDIO_EXTRACTION_FAILED', message, options);
  }
}

export class ModelFetchError extends ArgusError {
  constructor(message: string, options?: ErrorOptions) {
    super('MODEL_FETCH_FAILED', message, options);
  }
}

export class TranscriptionError extends ArgusError {
  constructor(message: string, options?: ErrorOptions) {
    super('TRANSCRIPTION_FAILED', message, options);
  }
}
