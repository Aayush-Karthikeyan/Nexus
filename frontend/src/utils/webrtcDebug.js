/**
 * State-only WebRTC diagnostics, off unless REACT_APP_DEBUG_WEBRTC is set.
 *
 * Deliberately never logs: SDP, full ICE candidate strings, IP addresses,
 * ports, auth tokens, TURN usernames/credentials, or provider secrets.
 * Only connection-state strings and candidate-type counts are emitted.
 */

export const isDebugEnabled = () => process.env.REACT_APP_DEBUG_WEBRTC === "true";

/**
 * Extracts only the candidate type keyword (host / srflx / prflx / relay)
 * from an RTCIceCandidate. The candidate string itself contains the peer's
 * IP address and port and is never returned or logged.
 */
export const candidateType = (candidate) => {
    if (!candidate) return null;

    if (typeof candidate.type === "string" && candidate.type) return candidate.type;

    // Safari/older browsers may not populate .type — read only the typ token.
    const raw = typeof candidate.candidate === "string" ? candidate.candidate : "";
    const match = raw.match(/ typ (host|srflx|prflx|relay)\b/);
    return match ? match[1] : null;
};

export const createCandidateCounter = () => {
    const counts = { host: 0, srflx: 0, prflx: 0, relay: 0 };
    return {
        record(candidate) {
            const type = candidateType(candidate);
            if (type && Object.prototype.hasOwnProperty.call(counts, type)) counts[type] += 1;
            return type;
        },
        snapshot() {
            return { ...counts };
        }
    };
};

export const logState = (peerLabel, event, state) => {
    if (!isDebugEnabled()) return;
    // peerLabel is a short opaque tag, not a socket id or address.
    console.log(`[webrtc] ${peerLabel} ${event}: ${state}`);
};

export const logCandidateCounts = (peerLabel, counts) => {
    if (!isDebugEnabled()) return;
    console.log(
        `[webrtc] ${peerLabel} candidates — host:${counts.host} srflx:${counts.srflx} prflx:${counts.prflx} relay:${counts.relay}`
    );
};
