function pad(value, width) {
    return String(value).padStart(width, '0');
}
function formatTimestamp(seconds, separator) {
    const totalMs = Math.max(0, Math.round(seconds * 1000));
    const h = Math.floor(totalMs / 3_600_000);
    const m = Math.floor((totalMs % 3_600_000) / 60_000);
    const s = Math.floor((totalMs % 60_000) / 1000);
    const ms = totalMs % 1000;
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${separator}${pad(ms, 3)}`;
}
/** Render segments as an SRT subtitle document. */
export function toSrt(segments) {
    return segments
        .map((segment, index) => `${index + 1}\n${formatTimestamp(segment.start, ',')} --> ${formatTimestamp(segment.end, ',')}\n${segment.text}\n`)
        .join('\n');
}
/** Render segments as a WebVTT document. */
export function toVtt(segments) {
    const body = segments
        .map((segment) => `${formatTimestamp(segment.start, '.')} --> ${formatTimestamp(segment.end, '.')}\n${segment.text}\n`)
        .join('\n');
    return `WEBVTT\n\n${body}`;
}
/** Render segments as plain text lines prefixed with [mm:ss] timestamps. */
export function toTimestampedText(segments) {
    return segments
        .map((segment) => {
        const m = Math.floor(segment.start / 60);
        const s = Math.floor(segment.start % 60);
        return `[${pad(m, 2)}:${pad(s, 2)}] ${segment.text}`;
    })
        .join('\n');
}
//# sourceMappingURL=format.js.map