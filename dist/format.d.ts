import type { TranscriptSegment } from './types.js';
/** Render segments as an SRT subtitle document. */
export declare function toSrt(segments: TranscriptSegment[]): string;
/** Render segments as a WebVTT document. */
export declare function toVtt(segments: TranscriptSegment[]): string;
/** Render segments as plain text lines prefixed with [mm:ss] timestamps. */
export declare function toTimestampedText(segments: TranscriptSegment[]): string;
//# sourceMappingURL=format.d.ts.map