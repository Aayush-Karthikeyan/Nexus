import httpStatus from "http-status";

/**
 * Issues short-lived TURN credentials to the browser.
 *
 * The Metered secret key stays on the server. Metered's own documentation is
 * explicit that the credential API must never be called from the front-end,
 * so this endpoint is the only place that key is used.
 *
 * Flow (Metered TURN REST API):
 *   1. POST /api/v1/turn/credential?secretKey=...  -> { username, password, apiKey, ... }
 *   2. GET  /api/v1/turn/credentials?apiKey=...    -> [ { urls, username, credential }, ... ]
 *
 * Only the sanitised ICE server array from step 2 is returned to the client.
 */

const CREDENTIAL_TTL_SECONDS = 3600; // short-lived: 1 hour

// Deliberately far shorter than the credential lifetime. Caching close to the
// full hour would hand the last client a credential about to expire mid-call.
export const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// Google STUN only. Deliberately NOT the shared public openrelay credentials —
// a direct-connection-only fallback that reports failure honestly is better
// than silently leaning on someone else's free relay.
export const FALLBACK_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" }
];

// --- rate limiting (in-memory, per IP) -------------------------------------
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestLog = new Map();

export const isRateLimited = (key, now = Date.now(), store = requestLog) => {
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    const hits = (store.get(key) || []).filter(t => t > windowStart);
    hits.push(now);
    store.set(key, hits);

    // Opportunistic sweep so the map cannot grow without bound
    if (store.size > 5000) {
        for (const [k, v] of store) {
            if (!v.some(t => t > windowStart)) store.delete(k);
        }
    }

    return hits.length > RATE_LIMIT_MAX_REQUESTS;
};

// --- response sanitising ---------------------------------------------------
/**
 * Rebuilds each ICE server entry field-by-field from an allow-list.
 * Anything the provider sends that isn't a URL/username/credential — apiKey,
 * secretKey, password, label, expiry — is structurally impossible to pass on.
 */
export const sanitizeIceServers = (raw) => {
    if (!Array.isArray(raw)) return null;

    const clean = [];
    for (const entry of raw) {
        if (!entry || typeof entry.urls !== "string") continue;
        if (!/^(stun|turn|turns):/i.test(entry.urls)) continue;

        const server = { urls: entry.urls };
        if (typeof entry.username === "string") server.username = entry.username;
        if (typeof entry.credential === "string") server.credential = entry.credential;
        clean.push(server);
    }

    return clean.length > 0 ? clean : null;
};

// --- error sanitising ------------------------------------------------------
/**
 * The provider request URL carries secretKey in its query string, and a failed
 * fetch can surface that URL in the thrown error. Everything logged from a
 * provider failure passes through here first.
 */
export const safeProviderError = (error, secretKey) => {
    let message = error && error.message ? String(error.message) : "unknown error";

    message = message.replace(/https?:\/\/\S+/gi, "[url-redacted]");
    message = message.replace(/secretKey=[^&\s"']*/gi, "secretKey=[redacted]");
    message = message.replace(/apiKey=[^&\s"']*/gi, "apiKey=[redacted]");
    if (secretKey) message = message.split(secretKey).join("[redacted]");

    return message;
};

// --- provider calls --------------------------------------------------------
const createExpiringCredential = async (domain, secretKey) => {
    // The secret key travels in the query string, so this URL is never logged.
    const url = `https://${domain}/api/v1/turn/credential?secretKey=${encodeURIComponent(secretKey)}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            expiryInSeconds: CREDENTIAL_TTL_SECONDS,
            label: "nexus"
        })
    });

    if (!response.ok) {
        throw new Error(`credential create returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || typeof data.apiKey !== "string") {
        throw new Error("credential create response missing apiKey");
    }

    return data.apiKey;
};

const fetchIceServersFromProvider = async (domain, apiKey) => {
    const url = `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`iceServers fetch returned HTTP ${response.status}`);
    }

    return response.json();
};

// --- cache -----------------------------------------------------------------
let cache = { iceServers: null, expiresAt: 0 };

export const resetTurnCache = () => { cache = { iceServers: null, expiresAt: 0 }; };

// --- handler ---------------------------------------------------------------
export const getTurnCredentials = async (req, res) => {
    // These credentials are temporary — no browser or CDN should keep a copy.
    res.set("Cache-Control", "no-store");

    const clientKey = req.ip || "unknown";

    if (isRateLimited(clientKey)) {
        return res.status(httpStatus.TOO_MANY_REQUESTS).json({
            message: "Too many requests. Please wait a moment and try again."
        });
    }

    const domain = process.env.METERED_DOMAIN;
    const secretKey = process.env.METERED_SECRET_KEY;

    if (!domain || !secretKey) {
        console.error("TURN: METERED_DOMAIN / METERED_SECRET_KEY not configured — serving STUN-only fallback");
        return res.status(httpStatus.OK).json({
            iceServers: FALLBACK_ICE_SERVERS,
            source: "fallback",
            relayAvailable: false
        });
    }

    if (cache.iceServers && Date.now() < cache.expiresAt) {
        return res.status(httpStatus.OK).json({
            iceServers: cache.iceServers,
            source: "metered",
            relayAvailable: true
        });
    }

    if (typeof fetch !== "function") {
        console.error("TURN: global fetch unavailable — Node 18+ is required. Serving STUN-only fallback.");
        return res.status(httpStatus.OK).json({
            iceServers: FALLBACK_ICE_SERVERS,
            source: "fallback",
            relayAvailable: false
        });
    }

    try {
        const apiKey = await createExpiringCredential(domain, secretKey);
        const iceServers = sanitizeIceServers(await fetchIceServersFromProvider(domain, apiKey));

        if (!iceServers) {
            throw new Error("provider returned no usable ICE servers");
        }

        cache = { iceServers, expiresAt: Date.now() + CACHE_DURATION_MS };

        return res.status(httpStatus.OK).json({
            iceServers,
            source: "metered",
            relayAvailable: true
        });
    } catch (e) {
        // Logs the provider hostname and a scrubbed description only — never
        // the request URL (which carries secretKey) or the secret itself.
        console.error(`TURN: could not obtain relay credentials from ${domain} — ${safeProviderError(e, secretKey)}`);
        return res.status(httpStatus.OK).json({
            iceServers: FALLBACK_ICE_SERVERS,
            source: "fallback",
            relayAvailable: false
        });
    }
};
