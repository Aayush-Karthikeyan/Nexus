import server from "../environment";

/**
 * ICE configuration is fetched from our own backend, which holds the TURN
 * provider secret. The browser only ever receives short-lived relay
 * credentials — never the provider secret.
 */

// Direct-connection only. Calls between peers on different networks
// (Wi-Fi to cellular) will usually fail on this, which is why the caller
// surfaces relayAvailable: false rather than failing silently.
export const FALLBACK_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" }
];

export const FALLBACK_CONFIG = {
    iceServers: FALLBACK_ICE_SERVERS,
    relayAvailable: false,
    source: "fallback"
};

// First try is short. If it looks like the backend is asleep (Render free tier
// cold starts take 30-60s) we wait out one long retry rather than dropping
// straight to STUN-only, which would break cross-network calls.
export const FIRST_ATTEMPT_TIMEOUT_MS = 8000;
export const RETRY_ATTEMPT_TIMEOUT_MS = 65000;

// Gateway-class statuses that mean "try again", not "this is broken"
const TRANSIENT_STATUSES = [502, 503, 504];

/**
 * Accepts only well-formed entries, so a malformed or hostile response can
 * never reach RTCPeerConnection.
 */
export const parseIceResponse = (data) => {
    if (!data || !Array.isArray(data.iceServers)) return null;

    const iceServers = data.iceServers.filter(
        (entry) => entry && typeof entry.urls === "string" && /^(stun|turn|turns):/i.test(entry.urls)
    );

    if (iceServers.length === 0) return null;

    return {
        iceServers,
        relayAvailable: iceServers.some((entry) => /^turns?:/i.test(entry.urls)),
        source: data.source === "metered" ? "metered" : "fallback"
    };
};

/**
 * One request.
 * Resolves { config } on success,
 *          { retryable: true }  for timeout / network error / 502-503-504,
 *          { retryable: false } for 4xx, other statuses, or a malformed body.
 */
const attemptFetch = async (doFetch, timeoutMs) => {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
        const response = await doFetch(`${server}/api/turn-credentials`, {
            signal: controller ? controller.signal : undefined
        });

        if (!response.ok) {
            return { retryable: TRANSIENT_STATUSES.includes(response.status) };
        }

        const config = parseIceResponse(await response.json());
        // A malformed body is a real defect, not a transient blip — no retry.
        return config ? { config } : { retryable: false };
    } catch (e) {
        // Abort (timeout) or network failure — both worth one retry.
        return { retryable: true };
    } finally {
        if (timer) clearTimeout(timer);
    }
};

/**
 * @param {function} [onRetry] called once before the long retry, so the UI can
 *                             explain the wait instead of appearing frozen.
 */
export const fetchIceServers = async ({
    firstTimeoutMs = FIRST_ATTEMPT_TIMEOUT_MS,
    retryTimeoutMs = RETRY_ATTEMPT_TIMEOUT_MS,
    fetchImpl,
    onRetry
} = {}) => {
    const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!doFetch) return FALLBACK_CONFIG;

    const first = await attemptFetch(doFetch, firstTimeoutMs);
    if (first.config) return first.config;
    if (!first.retryable) return FALLBACK_CONFIG;

    if (typeof onRetry === "function") onRetry();

    const second = await attemptFetch(doFetch, retryTimeoutMs);
    if (second.config) return second.config;

    return FALLBACK_CONFIG;
};
