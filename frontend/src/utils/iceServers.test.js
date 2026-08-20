import {
    fetchIceServers,
    parseIceResponse,
    FALLBACK_ICE_SERVERS,
    FALLBACK_CONFIG,
    FIRST_ATTEMPT_TIMEOUT_MS,
    RETRY_ATTEMPT_TIMEOUT_MS
} from './iceServers';
import { candidateType, createCandidateCounter } from './webrtcDebug';

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

const RELAY_BODY = {
    source: 'metered',
    iceServers: [
        { urls: 'stun:standard.relay.metered.ca:80' },
        { urls: 'turn:standard.relay.metered.ca:443', username: 'u', credential: 'c' }
    ]
};

// Fast test doubles — no real timers involved.
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

describe('parseIceResponse', () => {
    test('accepts a valid relay list and flags relayAvailable', () => {
        const result = parseIceResponse({
            source: 'metered',
            iceServers: [
                { urls: 'stun:standard.relay.metered.ca:80' },
                { urls: 'turn:standard.relay.metered.ca:443', username: 'u', credential: 'c' }
            ]
        });

        expect(result.relayAvailable).toBe(true);
        expect(result.source).toBe('metered');
        expect(result.iceServers).toHaveLength(2);
    });

    test('flags relayAvailable false when only STUN is returned', () => {
        const result = parseIceResponse({
            source: 'fallback',
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        expect(result.relayAvailable).toBe(false);
    });

    test('rejects malformed payloads', () => {
        expect(parseIceResponse(null)).toBeNull();
        expect(parseIceResponse({})).toBeNull();
        expect(parseIceResponse({ iceServers: 'nope' })).toBeNull();
        expect(parseIceResponse({ iceServers: [] })).toBeNull();
        expect(parseIceResponse({ iceServers: [{ urls: 'https://evil.test' }] })).toBeNull();
    });
});

describe('fetchIceServers fallback behaviour', () => {
    test('falls back to STUN-only when the request fails', async () => {
        const result = await fetchIceServers({
            fetchImpl: async () => { throw new Error('network down'); }
        });

        expect(result).toEqual(FALLBACK_CONFIG);
        expect(result.relayAvailable).toBe(false);
    });

    test('falls back on a non-2xx response', async () => {
        const result = await fetchIceServers({
            fetchImpl: async () => ({ ok: false, status: 500 })
        });

        expect(result.relayAvailable).toBe(false);
        expect(result.iceServers).toEqual(FALLBACK_ICE_SERVERS);
    });

    test('falls back when the body is malformed', async () => {
        const result = await fetchIceServers({ fetchImpl: ok({ nonsense: true }) });
        expect(result).toEqual(FALLBACK_CONFIG);
    });

    test('returns relay servers on success', async () => {
        const result = await fetchIceServers({
            fetchImpl: ok({
                source: 'metered',
                iceServers: [
                    { urls: 'stun:standard.relay.metered.ca:80' },
                    { urls: 'turn:standard.relay.metered.ca:443', username: 'u', credential: 'c' }
                ]
            })
        });

        expect(result.relayAvailable).toBe(true);
        expect(result.iceServers[1].urls).toMatch(/^turn:/);
    });

    test('fallback never uses the shared public openrelay host', () => {
        const serialised = JSON.stringify(FALLBACK_ICE_SERVERS);
        expect(serialised).not.toMatch(/openrelay/);
        expect(serialised).not.toMatch(/metered/);
    });
});

describe('cold-start retry behaviour', () => {
    test('retries once after a timeout and succeeds on the second attempt', async () => {
        const calls = [];
        const fetchImpl = jest.fn(async () => {
            calls.push(1);
            if (calls.length === 1) throw abortError();
            return { ok: true, status: 200, json: async () => RELAY_BODY };
        });

        const onRetry = jest.fn();
        const result = await fetchIceServers({ fetchImpl, onRetry });

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(result.relayAvailable).toBe(true);
        expect(result.source).toBe('metered');
    });

    test('retries once on a network error', async () => {
        const fetchImpl = jest.fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => RELAY_BODY });

        const result = await fetchIceServers({ fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result.relayAvailable).toBe(true);
    });

    test.each([502, 503, 504])('retries once on a transient %i', async (status) => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce({ ok: false, status })
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => RELAY_BODY });

        const result = await fetchIceServers({ fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result.relayAvailable).toBe(true);
    });

    test.each([400, 401, 403, 404, 429])('does NOT retry on %i', async (status) => {
        const fetchImpl = jest.fn(async () => ({ ok: false, status }));
        const onRetry = jest.fn();

        const result = await fetchIceServers({ fetchImpl, onRetry });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
        expect(result).toEqual(FALLBACK_CONFIG);
    });

    test('does NOT retry a malformed 200 body', async () => {
        const fetchImpl = jest.fn(ok({ nonsense: true }));
        const onRetry = jest.fn();

        const result = await fetchIceServers({ fetchImpl, onRetry });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
        expect(result).toEqual(FALLBACK_CONFIG);
    });

    test('retries at most once, then falls back', async () => {
        const fetchImpl = jest.fn(async () => { throw abortError(); });

        const result = await fetchIceServers({ fetchImpl });

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result).toEqual(FALLBACK_CONFIG);
        expect(result.relayAvailable).toBe(false);
    });

    test('no retry needed when the first attempt succeeds', async () => {
        const fetchImpl = jest.fn(ok(RELAY_BODY));
        const onRetry = jest.fn();

        await fetchIceServers({ fetchImpl, onRetry });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
    });

    test('second attempt allows for a Render cold start', () => {
        expect(FIRST_ATTEMPT_TIMEOUT_MS).toBe(8000);
        expect(RETRY_ATTEMPT_TIMEOUT_MS).toBeGreaterThanOrEqual(60000);
    });
});

describe('webrtcDebug never exposes addresses', () => {
    const realCandidate =
        'candidate:842163049 1 udp 1677729535 203.0.113.77 54321 typ srflx raddr 192.168.1.5 rport 54321';

    test('candidateType extracts only the type keyword', () => {
        expect(candidateType({ candidate: realCandidate })).toBe('srflx');
        expect(candidateType({ type: 'relay' })).toBe('relay');
        expect(candidateType(null)).toBeNull();
        expect(candidateType({ candidate: 'garbage' })).toBeNull();
    });

    test('counter output contains no IPs, ports, or candidate strings', () => {
        const counter = createCandidateCounter();
        counter.record({ candidate: realCandidate });
        counter.record({ type: 'relay' });
        counter.record({ type: 'host' });

        const snapshot = counter.snapshot();
        expect(snapshot).toEqual({ host: 1, srflx: 1, prflx: 0, relay: 1 });

        const serialised = JSON.stringify(snapshot);
        expect(serialised).not.toMatch(/203\.0\.113\.77/);
        expect(serialised).not.toMatch(/192\.168/);
        expect(serialised).not.toMatch(/54321/);
        expect(serialised).not.toMatch(/candidate:/);
    });
});
