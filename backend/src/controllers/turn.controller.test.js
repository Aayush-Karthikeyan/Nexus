import test from "node:test";
import assert from "node:assert/strict";

import {
    sanitizeIceServers,
    isRateLimited,
    resetTurnCache,
    getTurnCredentials,
    safeProviderError,
    FALLBACK_ICE_SERVERS,
    CACHE_DURATION_MS
} from "./turn.controller.js";

// Minimal Express res double
const mockRes = () => {
    const res = { statusCode: null, body: null, headers: {} };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { res.body = payload; return res; };
    res.set = (name, value) => { res.headers[name] = value; return res; };
    return res;
};

const withEnv = async (vars, fn) => {
    const saved = {};
    for (const [k, v] of Object.entries(vars)) {
        saved[k] = process.env[k];
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    try { await fn(); } finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k]; else process.env[k] = v;
        }
    }
};

test("sanitizeIceServers keeps only urls, username and credential", () => {
    const result = sanitizeIceServers([
        { urls: "stun:example.test:80" },
        { urls: "turn:example.test:443", username: "u1", credential: "c1" }
    ]);

    assert.deepEqual(result, [
        { urls: "stun:example.test:80" },
        { urls: "turn:example.test:443", username: "u1", credential: "c1" }
    ]);
});

test("sanitizeIceServers strips provider secrets from every entry", () => {
    const result = sanitizeIceServers([
        {
            urls: "turn:example.test:443",
            username: "u1",
            credential: "c1",
            apiKey: "SHOULD_NOT_LEAK",
            secretKey: "SHOULD_NOT_LEAK",
            password: "SHOULD_NOT_LEAK",
            label: "internal",
            expiryInSeconds: 3600
        }
    ]);

    const serialised = JSON.stringify(result);
    assert.equal(serialised.includes("SHOULD_NOT_LEAK"), false);
    assert.equal(serialised.includes("apiKey"), false);
    assert.equal(serialised.includes("secretKey"), false);
    assert.equal(serialised.includes("expiryInSeconds"), false);
    assert.deepEqual(Object.keys(result[0]).sort(), ["credential", "urls", "username"]);
});

test("sanitizeIceServers rejects non-arrays, empty lists and bad schemes", () => {
    assert.equal(sanitizeIceServers(null), null);
    assert.equal(sanitizeIceServers({ urls: "turn:example.test" }), null);
    assert.equal(sanitizeIceServers([]), null);
    assert.equal(sanitizeIceServers([{ urls: "https://evil.test" }]), null);
    assert.equal(sanitizeIceServers([{ nope: true }]), null);
});

test("isRateLimited allows a normal burst then blocks", () => {
    const store = new Map();
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
        assert.equal(isRateLimited("1.2.3.4", now, store), false, `request ${i + 1} should pass`);
    }
    assert.equal(isRateLimited("1.2.3.4", now, store), true, "21st request should be limited");
});

test("isRateLimited buckets each client separately and expires old windows", () => {
    const store = new Map();
    const now = Date.now();
    for (let i = 0; i < 21; i++) isRateLimited("1.1.1.1", now, store);

    assert.equal(isRateLimited("2.2.2.2", now, store), false, "other IP unaffected");
    assert.equal(isRateLimited("1.1.1.1", now + 61_000, store), false, "window resets after 60s");
});

test("returns STUN-only fallback when Metered env vars are absent", async () => {
    await withEnv({ METERED_DOMAIN: undefined, METERED_SECRET_KEY: undefined }, async () => {
        resetTurnCache();
        const res = mockRes();
        await getTurnCredentials({ ip: "203.0.113.10" }, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.source, "fallback");
        assert.equal(res.body.relayAvailable, false);
        assert.deepEqual(res.body.iceServers, FALLBACK_ICE_SERVERS);
    });
});

test("fallback never contains the shared public openrelay host", () => {
    const serialised = JSON.stringify(FALLBACK_ICE_SERVERS);
    assert.equal(serialised.includes("openrelay"), false);
    assert.equal(serialised.includes("metered"), false);
});

test("provider failure degrades to fallback without leaking the secret", async () => {
    await withEnv({
        METERED_DOMAIN: "example.metered.live",
        METERED_SECRET_KEY: "TOP_SECRET_VALUE"
    }, async () => {
        resetTurnCache();
        const realFetch = globalThis.fetch;
        globalThis.fetch = async () => ({ ok: false, status: 401 });

        try {
            const res = mockRes();
            await getTurnCredentials({ ip: "203.0.113.11" }, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.source, "fallback");
            assert.equal(res.body.relayAvailable, false);
            assert.equal(JSON.stringify(res.body).includes("TOP_SECRET_VALUE"), false);
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});

test("successful path returns sanitised servers and no secret material", async () => {
    await withEnv({
        METERED_DOMAIN: "example.metered.live",
        METERED_SECRET_KEY: "TOP_SECRET_VALUE"
    }, async () => {
        resetTurnCache();
        const realFetch = globalThis.fetch;

        globalThis.fetch = async (url, options) => {
            if (options && options.method === "POST") {
                return { ok: true, status: 200, json: async () => ({
                    username: "u1", password: "p1", apiKey: "INTERNAL_API_KEY", expiryInSeconds: 3600
                }) };
            }
            return { ok: true, status: 200, json: async () => ([
                { urls: "stun:standard.relay.metered.ca:80" },
                { urls: "turn:standard.relay.metered.ca:443", username: "u1", credential: "c1", apiKey: "INTERNAL_API_KEY" }
            ]) };
        };

        try {
            const res = mockRes();
            await getTurnCredentials({ ip: "203.0.113.12" }, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.body.source, "metered");
            assert.equal(res.body.relayAvailable, true);
            assert.equal(res.body.iceServers.length, 2);

            const serialised = JSON.stringify(res.body);
            assert.equal(serialised.includes("TOP_SECRET_VALUE"), false, "secret key must never be returned");
            assert.equal(serialised.includes("INTERNAL_API_KEY"), false, "intermediate apiKey must never be returned");
            assert.equal(serialised.includes("p1"), false, "provider password must never be returned");
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});

test("rate limit returns 429 and no ICE servers", async () => {
    resetTurnCache();
    const ip = "203.0.113.99";
    for (let i = 0; i < 20; i++) {
        const res = mockRes();
        await getTurnCredentials({ ip }, res);
    }

    const res = mockRes();
    await getTurnCredentials({ ip }, res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.iceServers, undefined);
});

// --- Cache-Control: no-store ----------------------------------------------

test("sets Cache-Control: no-store on the fallback response", async () => {
    await withEnv({ METERED_DOMAIN: undefined, METERED_SECRET_KEY: undefined }, async () => {
        resetTurnCache();
        const res = mockRes();
        await getTurnCredentials({ ip: "198.51.100.1" }, res);
        assert.equal(res.headers["Cache-Control"], "no-store");
    });
});

test("sets Cache-Control: no-store on the success response", async () => {
    await withEnv({
        METERED_DOMAIN: "example.metered.live",
        METERED_SECRET_KEY: "TOP_SECRET_VALUE"
    }, async () => {
        resetTurnCache();
        const realFetch = globalThis.fetch;
        globalThis.fetch = async (url, options) =>
            (options && options.method === "POST")
                ? { ok: true, status: 200, json: async () => ({ apiKey: "K" }) }
                : { ok: true, status: 200, json: async () => ([{ urls: "turn:r.test:443", username: "u", credential: "c" }]) };

        try {
            const res = mockRes();
            await getTurnCredentials({ ip: "198.51.100.2" }, res);
            assert.equal(res.headers["Cache-Control"], "no-store");
            assert.equal(res.body.source, "metered");
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});

test("sets Cache-Control: no-store on the rate-limited response", async () => {
    resetTurnCache();
    const ip = "198.51.100.3";
    for (let i = 0; i < 21; i++) {
        const res = mockRes();
        await getTurnCredentials({ ip }, res);
        if (res.statusCode === 429) {
            assert.equal(res.headers["Cache-Control"], "no-store");
            return;
        }
    }
    assert.fail("expected a 429 within 21 requests");
});

// --- cache duration --------------------------------------------------------

test("cache duration is 10 minutes, well inside the 1 hour credential life", () => {
    assert.equal(CACHE_DURATION_MS, 10 * 60 * 1000);
    assert.ok(CACHE_DURATION_MS < 60 * 60 * 1000, "must expire before the credential does");
});

test("second request inside the window is served from cache without re-calling the provider", async () => {
    await withEnv({
        METERED_DOMAIN: "example.metered.live",
        METERED_SECRET_KEY: "TOP_SECRET_VALUE"
    }, async () => {
        resetTurnCache();
        const realFetch = globalThis.fetch;
        let providerCalls = 0;

        globalThis.fetch = async (url, options) => {
            providerCalls += 1;
            return (options && options.method === "POST")
                ? { ok: true, status: 200, json: async () => ({ apiKey: "K" }) }
                : { ok: true, status: 200, json: async () => ([{ urls: "turn:r.test:443", username: "u", credential: "c" }]) };
        };

        try {
            await getTurnCredentials({ ip: "198.51.100.4" }, mockRes());
            const afterFirst = providerCalls;

            const res = mockRes();
            await getTurnCredentials({ ip: "198.51.100.5" }, res);

            assert.equal(providerCalls, afterFirst, "cached response must not hit the provider again");
            assert.equal(res.body.source, "metered");
            assert.equal(res.headers["Cache-Control"], "no-store");
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});

// --- secret-safe error handling -------------------------------------------

test("safeProviderError strips full URLs, query secrets and the raw key", () => {
    const secret = "sk_live_ACTUAL_SECRET";
    const dirty = new Error(
        `request to https://example.metered.live/api/v1/turn/credential?secretKey=${secret} failed`
    );

    const safe = safeProviderError(dirty, secret);

    assert.equal(safe.includes(secret), false, "raw secret must be removed");
    assert.equal(safe.includes("https://"), false, "URL must be redacted");
    assert.equal(safe.includes("example.metered.live"), false, "host inside the URL must go with it");
    assert.ok(safe.includes("[url-redacted]"));
});

test("safeProviderError redacts a bare secretKey/apiKey query fragment", () => {
    assert.equal(safeProviderError(new Error("secretKey=abc123 rejected"), null).includes("abc123"), false);
    assert.equal(safeProviderError(new Error("apiKey=xyz789 rejected"), null).includes("xyz789"), false);
});

test("safeProviderError handles missing or malformed errors", () => {
    assert.equal(safeProviderError(null, "s"), "unknown error");
    assert.equal(safeProviderError({}, "s"), "unknown error");
});

test("a provider error carrying the secret in its message is never logged raw", async () => {
    await withEnv({
        METERED_DOMAIN: "example.metered.live",
        METERED_SECRET_KEY: "LEAKY_SECRET_VALUE"
    }, async () => {
        resetTurnCache();
        const realFetch = globalThis.fetch;
        const realError = console.error;
        const logged = [];

        console.error = (...args) => { logged.push(args.join(" ")); };
        globalThis.fetch = async () => {
            throw new Error(
                "fetch failed for https://example.metered.live/api/v1/turn/credential?secretKey=LEAKY_SECRET_VALUE"
            );
        };

        try {
            const res = mockRes();
            await getTurnCredentials({ ip: "198.51.100.6" }, res);

            const all = logged.join("\n");
            assert.equal(all.includes("LEAKY_SECRET_VALUE"), false, "secret must never reach the log");
            assert.equal(all.includes("secretKey=LEAKY"), false);
            assert.ok(all.includes("example.metered.live"), "sanitized hostname is allowed and useful");
            assert.equal(res.body.source, "fallback");
        } finally {
            globalThis.fetch = realFetch;
            console.error = realError;
        }
    });
});
