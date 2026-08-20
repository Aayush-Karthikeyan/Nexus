import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import VideoMeetComponent from './VideoMeet';
import { fetchIceServers } from '../utils/iceServers';

// Joining starts media capture, an ICE fetch and a socket connection — none of
// which exist in jsdom. Stub those boundaries so the lobby itself is testable.
// Note: CRA sets resetMocks:true, so implementations are (re)applied in beforeEach.
jest.mock('socket.io-client', () => {
    const fakeSocket = { on: () => { }, emit: () => { }, disconnect: () => { }, id: 'test-socket' };
    return { __esModule: true, default: { connect: () => fakeSocket }, connect: () => fakeSocket };
});

jest.mock('../utils/iceServers', () => ({
    __esModule: true,
    FALLBACK_ICE_SERVERS: [{ urls: 'stun:stun.l.google.com:19302' }],
    FALLBACK_CONFIG: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        relayAvailable: false,
        source: 'fallback'
    },
    fetchIceServers: jest.fn()
}));

const LOBBY_INPUT = 'Your display name';

// Settles the async getPermissions() state updates inside act()
const renderLobby = async () => {
    let utils;
    await act(async () => { utils = render(<VideoMeetComponent />); });
    return utils;
};

const joinAs = async (name) => {
    const input = screen.getByPlaceholderText(LOBBY_INPUT);
    fireEvent.change(input, { target: { value: name } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /join meeting/i }));
    });
};

beforeEach(() => {
    localStorage.clear();

    fetchIceServers.mockResolvedValue({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        relayAvailable: false,
        source: 'fallback'
    });

    Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: () => Promise.reject(new Error('no media in jsdom')) },
        configurable: true,
        writable: true
    });

    global.MediaStream = class {
        constructor(tracks = []) { this._t = tracks; }
        getTracks() { return this._t; }
        get active() { return true; }
    };
    global.AudioContext = class {
        createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{ enabled: false }] } }; }
        createOscillator() { return { connect: (d) => d, start() { } }; }
        resume() { }
    };
    HTMLCanvasElement.prototype.getContext = () => ({ fillRect: () => { } });
    HTMLCanvasElement.prototype.captureStream = () => ({ getVideoTracks: () => [{ enabled: false }] });
});

afterEach(() => {
    localStorage.clear();
});

describe('meeting lobby display-name field', () => {
    // The regression this file exists for.
    test('starts blank even when a previous name is left in browser storage', async () => {
        localStorage.setItem('meetUsername', 'PreviousPerson');

        await renderLobby();

        const input = screen.getByPlaceholderText(LOBBY_INPUT);
        expect(input).toHaveValue('');
        expect(input.value).not.toMatch(/PreviousPerson/);
    });

    test('starts blank when storage is empty', async () => {
        await renderLobby();
        expect(screen.getByPlaceholderText(LOBBY_INPUT)).toHaveValue('');
    });

    test('clears a stale meetUsername key from storage on mount', async () => {
        localStorage.setItem('meetUsername', 'PreviousPerson');

        await renderLobby();

        expect(localStorage.getItem('meetUsername')).toBeNull();
    });

    test('leaves the auth token untouched', async () => {
        localStorage.setItem('token', 'auth-token-value');
        localStorage.setItem('meetUsername', 'PreviousPerson');

        await renderLobby();

        expect(localStorage.getItem('token')).toBe('auth-token-value');
    });

    test('accepts the name the current user types', async () => {
        await renderLobby();

        const input = screen.getByPlaceholderText(LOBBY_INPUT);
        fireEvent.change(input, { target: { value: 'Alice' } });

        expect(input).toHaveValue('Alice');
    });

    test('input opts out of browser autofill', async () => {
        await renderLobby();
        expect(screen.getByPlaceholderText(LOBBY_INPUT)).toHaveAttribute('autocomplete', 'off');
    });

    test('joining does not persist the name for a later session', async () => {
        await renderLobby();
        await joinAs('Alice');

        await waitFor(() => expect(screen.queryByPlaceholderText(LOBBY_INPUT)).not.toBeInTheDocument());
        expect(localStorage.getItem('meetUsername')).toBeNull();
    });

    test('a fresh visit after someone joined still shows a blank field', async () => {
        const first = await renderLobby();
        await joinAs('Alice');
        await waitFor(() => expect(screen.queryByPlaceholderText(LOBBY_INPUT)).not.toBeInTheDocument());
        first.unmount();

        await renderLobby();

        expect(screen.getByPlaceholderText(LOBBY_INPUT)).toHaveValue('');
    });
});
