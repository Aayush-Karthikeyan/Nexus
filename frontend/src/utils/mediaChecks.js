/**
 * Per-kind liveness check for a local MediaStream.
 *
 * A stream can be "active" with its video track live while the audio track
 * has ended — mobile OSes end mic tracks on screen lock, backgrounding, or
 * interruptions. Judging usability with a kind-blind some() reuses that
 * half-dead stream and silently joins the call with no outgoing audio.
 */
export const isStreamUsable = (stream, { needAudio = false, needVideo = false } = {}) => {
    if (!stream || !stream.active) return false;

    const live = (kind) =>
        stream.getTracks().some((t) => t.kind === kind && t.readyState === "live");

    if (needAudio && !live("audio")) return false;
    if (needVideo && !live("video")) return false;
    return true;
};

/**
 * First live track of a kind, or null. Goes through getTracks() so it works
 * on anything stream-shaped, not only a full MediaStream implementation.
 */
export const getLiveTrack = (stream, kind) => {
    if (!stream || typeof stream.getTracks !== "function") return null;
    return stream.getTracks().find((t) => t.kind === kind && t.readyState === "live") || null;
};
