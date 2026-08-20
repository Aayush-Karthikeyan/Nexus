import { isStreamUsable, getLiveTrack } from './mediaChecks';

const track = (kind, readyState = 'live') => ({ kind, readyState });

const stream = (tracks, active = true) => ({
    active,
    getTracks: () => tracks
});

describe('isStreamUsable', () => {
    test('live audio + live video passes when both are needed', () => {
        const s = stream([track('audio'), track('video')]);
        expect(isStreamUsable(s, { needAudio: true, needVideo: true })).toBe(true);
    });

    // The one-way-audio regression: video alive, mic dead, stream still "active"
    test('dead audio + live video FAILS when audio is needed', () => {
        const s = stream([track('audio', 'ended'), track('video')]);
        expect(isStreamUsable(s, { needAudio: true, needVideo: true })).toBe(false);
    });

    test('missing audio track FAILS when audio is needed', () => {
        const s = stream([track('video')]);
        expect(isStreamUsable(s, { needAudio: true, needVideo: true })).toBe(false);
    });

    test('dead video + live audio FAILS when video is needed', () => {
        const s = stream([track('audio'), track('video', 'ended')]);
        expect(isStreamUsable(s, { needAudio: true, needVideo: true })).toBe(false);
    });

    test('audio-only stream passes when only audio is needed', () => {
        const s = stream([track('audio')]);
        expect(isStreamUsable(s, { needAudio: true, needVideo: false })).toBe(true);
    });

    test('video-only stream passes when only video is needed', () => {
        const s = stream([track('video')]);
        expect(isStreamUsable(s, { needAudio: false, needVideo: true })).toBe(true);
    });

    test('null, undefined, and inactive streams fail', () => {
        expect(isStreamUsable(null, { needAudio: true })).toBe(false);
        expect(isStreamUsable(undefined, { needAudio: true })).toBe(false);
        expect(isStreamUsable(stream([track('audio')], false), { needAudio: true })).toBe(false);
    });

    test('tracks without a kind (test doubles, exotic tracks) never satisfy a need', () => {
        const s = stream([{ readyState: 'live' }]);
        expect(isStreamUsable(s, { needAudio: true })).toBe(false);
    });

    test('no needs at all: any active stream passes', () => {
        expect(isStreamUsable(stream([]))).toBe(true);
    });
});

describe('getLiveTrack', () => {
    test('returns the first live track of the requested kind', () => {
        const mic = track('audio');
        const s = stream([track('audio', 'ended'), mic, track('video')]);
        expect(getLiveTrack(s, 'audio')).toBe(mic);
    });

    test('returns null when only dead tracks of that kind exist', () => {
        const s = stream([track('audio', 'ended'), track('video')]);
        expect(getLiveTrack(s, 'audio')).toBeNull();
    });

    test('tolerates null streams and objects without getTracks', () => {
        expect(getLiveTrack(null, 'audio')).toBeNull();
        expect(getLiveTrack({}, 'audio')).toBeNull();
    });
});
