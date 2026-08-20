import React, { useEffect, useRef, useState } from 'react'
import io from "socket.io-client";
import { Badge, IconButton } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import styles from "../styles/videoComponent.module.css";
import CallEndIcon from '@mui/icons-material/CallEnd'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare'
import ChatIcon from '@mui/icons-material/Chat'
import server from '../environment';
import { fetchIceServers, FALLBACK_CONFIG } from '../utils/iceServers';
import { isStreamUsable, getLiveTrack } from '../utils/mediaChecks';
import { createCandidateCounter, logState, logCandidateCounts } from '../utils/webrtcDebug';

const server_url = server;

var connections = {};

// ICE servers come from our backend, which holds the TURN provider secret.
// STUN alone finds a direct path; a TURN relay is required when peers sit on
// different networks (phone on cellular vs laptop on Wi-Fi) behind symmetric NAT.
let peerConfigConnections = { iceServers: FALLBACK_CONFIG.iceServers };

export default function VideoMeetComponent() {

    var socketRef = useRef();
    let socketIdRef = useRef();

    let localVideoref = useRef();

    let [video, setVideo] = useState(true);

    let [audio, setAudio] = useState(true);

    let [screen, setScreen] = useState(false);

    // chat starts closed on phones — it covers the video there
    let [showModal, setModal] = useState(() => window.innerWidth > 768);

    let [screenAvailable, setScreenAvailable] = useState(false);

    let [messages, setMessages] = useState([])

    let [message, setMessage] = useState("");

    let [newMessages, setNewMessages] = useState(0);

    let [askForUsername, setAskForUsername] = useState(true);

    // Always blank on entry. The display name is per-meeting and is never
    // persisted, so a shared browser can't show one person's name to the next.
    let [username, setUsername] = useState("");
    const myUsernameRef = useRef("");

    const videoRef = useRef([])

    let [videos, setVideos] = useState([])

    // Camera+mic stream stays here even while screen sharing, so we can swap back
    const cameraStreamRef = useRef(null);
    const screenStreamRef = useRef(null);

    // ICE candidates that arrive before the remote description is set
    const pendingIceRef = useRef({});

    // Per-peer candidate-type tallies, used only for debug output
    const candidateStatsRef = useRef({});

    // Surfaces a relay/ICE problem instead of leaving a silent blank call
    let [connectionWarning, setConnectionWarning] = useState("");
    const relayAvailableRef = useRef(true);

    // Mic problems get their own message so ICE state changes (which clear
    // connectionWarning on 'connected') can't hide "others can't hear you"
    let [micWarning, setMicWarning] = useState("");
    const hasRealMicRef = useRef(false);

    useEffect(() => {
        // Purge the name left behind by older builds that cached it. Nothing
        // reads this key any more; this clears it from browsers that still have one.
        try { localStorage.removeItem("meetUsername"); } catch (e) { }

        getPermissions();

        return () => {
            try { socketRef.current && socketRef.current.disconnect() } catch (e) { }
            for (let id in connections) {
                try { connections[id].close() } catch (e) { }
                delete connections[id]
            }
            try { window.localStream && window.localStream.getTracks().forEach(track => track.stop()) } catch (e) { }
            try { screenStreamRef.current && screenStreamRef.current.getTracks().forEach(track => track.stop()) } catch (e) { }
        }
    }, [])  // eslint-disable-line react-hooks/exhaustive-deps

    const getPermissions = async () => {
        let camAvailable = false;
        let micAvailable = false;

        try {
            const probe = await navigator.mediaDevices.getUserMedia({ video: true });
            probe.getTracks().forEach(track => track.stop());
            camAvailable = true;
        } catch (e) { }

        try {
            const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
            probe.getTracks().forEach(track => track.stop());
            micAvailable = true;
        } catch (e) { }

        setScreenAvailable(!!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia));

        if (camAvailable || micAvailable) {
            try {
                const userMediaStream = await navigator.mediaDevices.getUserMedia({ video: camAvailable, audio: micAvailable });
                window.localStream = userMediaStream;
                cameraStreamRef.current = userMediaStream;
                if (localVideoref.current) {
                    localVideoref.current.srcObject = userMediaStream;
                }
            } catch (error) {
                console.log(error);
            }
        }
    };

    // Re-attach the local stream after the lobby <video> is swapped for the in-meeting pip
    useEffect(() => {
        if (!askForUsername && localVideoref.current && window.localStream) {
            localVideoref.current.srcObject = window.localStream;
        }
    }, [askForUsername])

    // Combined request first; if it fails, fall back to one request per kind
    // so a denied/busy camera doesn't cost the mic, and vice versa. The lobby
    // probe's verdict is treated as a hint, not a veto — a transient probe
    // failure must not permanently disable audio for the whole call.
    const acquireLocalMedia = async () => {
        try {
            return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (e) { }

        const tracks = [];
        try {
            const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
            tracks.push(...mic.getAudioTracks());
        } catch (e) { }
        try {
            const cam = await navigator.mediaDevices.getUserMedia({ video: true });
            tracks.push(...cam.getVideoTracks());
        } catch (e) { }

        return tracks.length ? new MediaStream(tracks) : null;
    };

    // Acquire (or reuse) the local stream FIRST, then join the room.
    // Joining before media is ready is what caused offers to be sent with
    // tracks that immediately got stopped, breaking the peer connection.
    const getMedia = async () => {
        let stream = window.localStream;

        // Reuse only when BOTH kinds are still live. A mobile OS can end the
        // mic track (screen lock, interruption) while video survives — reusing
        // that half-dead stream is what caused one-way audio in production.
        if (!isStreamUsable(stream, { needAudio: true, needVideo: true })) {
            const fresh = await acquireLocalMedia();
            if (fresh) {
                try { stream && stream.getTracks().forEach(track => track.stop()) } catch (e) { }
                stream = fresh;
            }
        }

        const liveAudio = getLiveTrack(stream, 'audio');
        const liveVideo = getLiveTrack(stream, 'video');

        // Per-kind placeholders keep both m-lines in the SDP even when a device
        // is missing, so both directions negotiate sendrecv regardless of join
        // order — and a recovered mic can later be swapped in with replaceTrack,
        // no renegotiation, the same mechanism screen sharing uses.
        stream = new MediaStream([liveVideo || black(), liveAudio || silence()]);

        hasRealMicRef.current = !!liveAudio;
        setMicWarning(liveAudio ? "" : "Microphone unavailable — other participants can't hear you.");
        logState('local', 'tracks', `audio:${liveAudio ? 'live' : 'placeholder'} video:${liveVideo ? 'live' : 'placeholder'}`);

        window.localStream = stream;
        cameraStreamRef.current = stream;
        if (localVideoref.current) {
            localVideoref.current.srcObject = stream;
        }

        // ICE config must be resolved BEFORE any peer connection is created,
        // otherwise the first peers would be built without a relay.
        const iceConfig = await fetchIceServers({
            onRetry: () => setConnectionWarning("Waking the secure relay server…")
        });
        peerConfigConnections = { iceServers: iceConfig.iceServers };
        relayAvailableRef.current = iceConfig.relayAvailable;
        setConnectionWarning("");

        logState('local', 'ice-config', `${iceConfig.source} relay:${iceConfig.relayAvailable}`);

        if (!iceConfig.relayAvailable) {
            setConnectionWarning(
                "No relay server available — calls between different networks may not connect."
            );
        }

        connectToSocketServer();
    }

    const createPeerConnection = (socketListId, nameMap) => {
        const pc = new RTCPeerConnection(peerConfigConnections);
        connections[socketListId] = pc;

        // Short opaque tag so debug output never carries a socket id
        const peerLabel = `peer-${Object.keys(connections).indexOf(socketListId) + 1}`;
        const counter = createCandidateCounter();
        candidateStatsRef.current[socketListId] = counter;

        pc.onicecandidate = function (event) {
            if (event.candidate != null) {
                // Records the type keyword only — never the candidate string,
                // which contains IP addresses and ports.
                counter.record(event.candidate);
                socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }))
            } else {
                // null candidate = gathering complete
                logCandidateCounts(peerLabel, counter.snapshot());
            }
        }

        pc.onicegatheringstatechange = () => {
            logState(peerLabel, 'iceGatheringState', pc.iceGatheringState);
        }

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            logState(peerLabel, 'iceConnectionState', state);

            if (state === 'failed') {
                logCandidateCounts(peerLabel, counter.snapshot());
                setConnectionWarning(
                    relayAvailableRef.current
                        ? "Couldn't connect to a participant. Your networks may be blocking the connection."
                        : "No relay server available — calls between different networks may not connect."
                );
            } else if (state === 'disconnected') {
                setConnectionWarning("Connection unstable — trying to recover…");
            } else if (state === 'connected' || state === 'completed') {
                setConnectionWarning("");
            }
        }

        pc.onconnectionstatechange = () => {
            logState(peerLabel, 'connectionState', pc.connectionState);
        }

        pc.onicecandidateerror = (event) => {
            // Host only — never the full URL, which carries TURN credentials.
            let host = 'unknown';
            try { host = event.url ? new URL(event.url.replace(/^turns?:/i, 'https://').split('?')[0]).hostname : 'unknown'; } catch (e) { }
            logState(peerLabel, 'iceCandidateError', `code:${event.errorCode} host:${host}`);
        }

        pc.ontrack = (event) => {
            const remoteStream = event.streams[0];
            if (!remoteStream) return;

            const participantName = (nameMap && nameMap[socketListId]) || "Anonymous";

            setVideos(videos => {
                const exists = videos.find(video => video.socketId === socketListId);
                let updatedVideos;
                if (exists) {
                    updatedVideos = videos.map(video =>
                        video.socketId === socketListId ? { ...video, stream: remoteStream } : video
                    );
                } else {
                    updatedVideos = [...videos, {
                        socketId: socketListId,
                        stream: remoteStream,
                        autoplay: true,
                        playsinline: true,
                        username: participantName
                    }];
                }
                videoRef.current = updatedVideos;
                return updatedVideos;
            });
        };

        if (window.localStream) {
            window.localStream.getTracks().forEach(track => pc.addTrack(track, window.localStream));

            // If we're mid screen-share, new joiners should see the screen
            const screenTrack = screenStreamRef.current && screenStreamRef.current.getVideoTracks()[0];
            if (screenTrack) {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack).catch(e => console.log(e));
            }
        }

        return pc;
    }

    let gotMessageFromServer = (fromId, message) => {
        var signal = JSON.parse(message)

        if (fromId === socketIdRef.current) return;

        const pc = connections[fromId];
        if (!pc) return;

        if (signal.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                // Flush any ICE candidates that arrived before the description
                const queued = pendingIceRef.current[fromId] || [];
                queued.forEach(candidate => {
                    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.log(e))
                });
                pendingIceRef.current[fromId] = [];

                if (signal.sdp.type === 'offer') {
                    pc.createAnswer().then((description) => {
                        pc.setLocalDescription(description).then(() => {
                            socketRef.current.emit('signal', fromId, JSON.stringify({ 'sdp': pc.localDescription }))
                        }).catch(e => console.log(e))
                    }).catch(e => console.log(e))
                }
            }).catch(e => console.log(e))
        }

        if (signal.ice) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
                pc.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e))
            } else {
                if (!pendingIceRef.current[fromId]) pendingIceRef.current[fromId] = [];
                pendingIceRef.current[fromId].push(signal.ice);
            }
        }
    }

    let connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, {
            transports: ['websocket', 'polling'],
            secure: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        })

        socketRef.current.on('signal', gotMessageFromServer)

        socketRef.current.on('chat-message', (data, sender, socketIdSender) => {
            addMessageRef.current(data, sender, socketIdSender);
        })

        socketRef.current.on('user-left', (id) => {
            setVideos((videos) => {
                const updatedVideos = videos.filter((video) => video.socketId !== id);
                videoRef.current = updatedVideos;
                return updatedVideos;
            })
            if (connections[id]) {
                try { connections[id].close() } catch (e) { }
                delete connections[id];
            }
            delete pendingIceRef.current[id];
            delete candidateStatsRef.current[id];
        })

        socketRef.current.on('user-joined', (id, clients, nameMap) => {
            clients.forEach((socketListId) => {
                // Never connect to ourselves, and never tear down an
                // already-established connection when someone else joins
                if (socketListId === socketIdRef.current) return;
                if (connections[socketListId]) return;

                createPeerConnection(socketListId, nameMap);
            })

            if (id === socketIdRef.current) {
                // We are the newcomer — offer to every existing peer.
                // Existing peers just wait for our offer, so there's no glare.
                for (let id2 in connections) {
                    if (id2 === socketIdRef.current) continue

                    const pc = connections[id2];
                    pc.createOffer().then((description) => {
                        pc.setLocalDescription(description)
                            .then(() => {
                                socketRef.current.emit('signal', id2, JSON.stringify({ 'sdp': pc.localDescription }))
                            })
                            .catch(e => console.log(e))
                    }).catch(e => console.log(e))
                }
            }
        })

        socketRef.current.on('connect', () => {
            socketIdRef.current = socketRef.current.id
            socketRef.current.emit('join-call', window.location.href, myUsernameRef.current || "Anonymous")
        })
    }

    let silence = () => {
        let ctx = new AudioContext()
        let oscillator = ctx.createOscillator()
        let dst = oscillator.connect(ctx.createMediaStreamDestination())
        oscillator.start()
        ctx.resume()
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
    }
    let black = ({ width = 640, height = 480 } = {}) => {
        let canvas = Object.assign(document.createElement("canvas"), { width, height })
        canvas.getContext('2d').fillRect(0, 0, width, height)
        let stream = canvas.captureStream()
        return Object.assign(stream.getVideoTracks()[0], { enabled: false })
    }

    // Mute/unmute by toggling track.enabled — no renegotiation needed,
    // the track stays attached and just sends black/silence while disabled
    let handleVideo = () => {
        const next = !video;
        setVideo(next);
        try {
            window.localStream.getVideoTracks().forEach(track => track.enabled = next);
        } catch (e) { console.log(e) }
    }
    let handleAudio = async () => {
        const next = !audio;
        setAudio(next);

        // Unmuting without a real mic: try to acquire one now. The silence
        // placeholder already holds the audio m-line open, so the new track
        // swaps in via replaceTrack with no renegotiation.
        if (next && !hasRealMicRef.current) {
            try {
                const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const micTrack = micStream.getAudioTracks()[0];
                if (micTrack) {
                    try {
                        window.localStream.getAudioTracks().forEach(t => {
                            t.stop();
                            window.localStream.removeTrack(t);
                        });
                        window.localStream.addTrack(micTrack);
                    } catch (e) { console.log(e) }
                    replaceOutgoingTrack('audio', micTrack);
                    hasRealMicRef.current = true;
                    setMicWarning("");
                    logState('local', 'mic-recovery', 'succeeded');
                }
            } catch (e) {
                logState('local', 'mic-recovery', 'failed');
            }
        }

        try {
            window.localStream.getAudioTracks().forEach(track => track.enabled = next);
        } catch (e) { console.log(e) }
    }

    const replaceOutgoingTrack = (kind, track) => {
        for (let id in connections) {
            const sender = connections[id].getSenders().find(s => s.track && s.track.kind === kind);
            if (sender) sender.replaceTrack(track).catch(e => console.log(e));
        }
    }

    const replaceOutgoingVideoTrack = (track) => replaceOutgoingTrack('video', track);

    const stopScreenShare = () => {
        try { screenStreamRef.current && screenStreamRef.current.getTracks().forEach(track => track.stop()) } catch (e) { }
        screenStreamRef.current = null;

        const camTrack = (cameraStreamRef.current && cameraStreamRef.current.getVideoTracks()[0]) || null;
        replaceOutgoingVideoTrack(camTrack);
        if (localVideoref.current) {
            localVideoref.current.srcObject = cameraStreamRef.current;
        }
        setScreen(false);
    }

    let handleScreen = async () => {
        if (screen) {
            stopScreenShare();
            return;
        }

        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const screenTrack = displayStream.getVideoTracks()[0];
            screenStreamRef.current = displayStream;

            // Swap the outgoing video track — no renegotiation needed
            replaceOutgoingVideoTrack(screenTrack);
            if (localVideoref.current) {
                localVideoref.current.srcObject = displayStream;
            }

            screenTrack.onended = () => stopScreenShare();
            setScreen(true);
        } catch (e) { console.log(e) }
    }

    let handleEndCall = () => {
        try { window.localStream && window.localStream.getTracks().forEach(track => track.stop()) } catch (e) { }
        try { screenStreamRef.current && screenStreamRef.current.getTracks().forEach(track => track.stop()) } catch (e) { }
        for (let id in connections) {
            try { connections[id].close() } catch (e) { }
            delete connections[id]
        }
        try { socketRef.current && socketRef.current.disconnect() } catch (e) { }
        window.location.href = "/"
    }


    // Use a ref so connectToSocketServer can always access the latest version
    // without stale-closure / temporal-dead-zone issues
    const addMessageRef = useRef(null);

    const addMessage = (data, sender, socketIdSender) => {
        // Skip live echo of own messages (we add locally in sendMessage)
        const isLiveEcho = socketIdSender === socketIdRef.current;
        if (isLiveEcho) return;
        const fromMe = sender === myUsernameRef.current;
        setMessages((prevMessages) => [
            ...prevMessages,
            { sender: sender, data: data, fromMe }
        ]);
        if (!fromMe) setNewMessages((prevNewMessages) => prevNewMessages + 1);
    };

    // Keep ref in sync so socket listener always calls latest closure
    addMessageRef.current = addMessage;

    let sendMessage = () => {
        if (!message.trim()) return;
        const displayName = myUsernameRef.current || "Anonymous";
        socketRef.current.emit('chat-message', message, displayName);
        // Add locally — fromMe always true for messages we send
        setMessages(prev => [...prev, { sender: displayName, data: message, fromMe: true }]);
        setMessage("");
    }


    let connect = () => {
        const name = username.trim() || "Anonymous";
        setUsername(name);
        myUsernameRef.current = name;
        setAskForUsername(false);
        getMedia();
    }


    return (
        <div>

            {askForUsername === true ?

                <div className="lobby-page">
                    {/* Orbs */}
                    <div className="orb orb-purple" style={{ width: 500, height: 500, top: '-150px', left: '-100px' }} />
                    <div className="orb orb-blue"   style={{ width: 400, height: 400, bottom: '-100px', right: '-80px' }} />

                    <div className="lobby-card glass">
                        <span className="wordmark">NEXUS<span className="wm-dot" />APP</span>

                        <div className="lobby-preview">
                            <video ref={localVideoref} autoPlay muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:0 }} />
                        </div>

                        <div style={{ textAlign:'center' }}>
                            <h2 style={{ fontFamily:'var(--font-display)', fontSize:'1.8rem', fontWeight:800, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:8 }}>Ready to join?</h2>
                            <p style={{ fontSize:10, color:'var(--muted)', fontFamily:'var(--font-mono)', letterSpacing:'0.2em', textTransform:'uppercase' }}>Enter your display name to continue</p>
                        </div>

                        <input
                            className="nexus-input"
                            style={{ width:'100%', padding:'14px 18px', fontSize:'15px' }}
                            placeholder="Your display name"
                            name="nexus-display-name"
                            autoComplete="off"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && connect()}
                            autoFocus
                        />

                        <button className="btn-glow" style={{ width:'100%', justifyContent:'center', padding:'14px' }} onClick={connect}>
                            Join meeting →
                        </button>
                    </div>
                </div> :


                <div className={styles.meetVideoContainer}>

                    {/* Connection/mic trouble notice — replaces a silent blank call */}
                    {(connectionWarning || micWarning) && (
                        <div
                            role="status"
                            style={{
                                position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                                zIndex: 30, maxWidth: 'min(90vw, 460px)',
                                background: 'rgba(239,68,68,0.92)', color: '#fff',
                                border: '1px solid rgba(255,255,255,0.25)', borderRadius: 0,
                                padding: '9px 14px',
                                fontFamily: 'var(--font-mono)', fontSize: 10,
                                letterSpacing: '0.12em', textTransform: 'uppercase',
                                textAlign: 'center', backdropFilter: 'blur(6px)'
                            }}
                        >
                            {connectionWarning || micWarning}
                        </div>
                    )}

                    {showModal ? <div className={styles.chatRoom}>

                        <div className={styles.chatContainer}>
                            <h1>Chat</h1>

                            <div className={styles.chattingDisplay}>

                                {messages.length !== 0 ? messages.map((item, index) => {
                                    const isMe = item.fromMe === true;
                                    return (
                                        <div key={index} style={{ display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                                            <span style={{ fontSize:8, fontWeight:700, fontFamily:'var(--font-mono)', color: isMe ? '#ffffff' : 'rgba(255,255,255,0.5)', marginBottom:5, letterSpacing:'0.22em', textTransform:'uppercase' }}>
                                                {isMe ? 'You' : item.sender}
                                            </span>
                                            <div style={{
                                                maxWidth:'85%',
                                                padding:'9px 13px',
                                                borderRadius: 0,
                                                background: isMe ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                                                border: `1px solid ${isMe ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                                                fontSize:13,
                                                lineHeight:1.45,
                                                fontFamily:'var(--font-body)',
                                                color:'var(--text)',
                                                wordBreak:'break-word'
                                            }}>
                                                {item.data}
                                            </div>
                                        </div>
                                    )
                                }) : <p>No Messages Yet</p>}


                            </div>

                            <div className={styles.chattingArea}>
                                <input
                                    className="nexus-input"
                                    style={{ flex:1, padding:'11px 14px', fontSize:'14px', borderRadius:'12px' }}
                                    placeholder="Type a message…"
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                />
                                <button className="btn-glow" style={{ padding:'11px 18px', fontSize:'13px', borderRadius:'12px', whiteSpace:'nowrap' }} onClick={sendMessage}>
                                    Send
                                </button>
                            </div>


                        </div>
                    </div> : <></>}


                    <div className={styles.buttonContainers}>
                        <IconButton onClick={handleVideo} aria-label={video ? "Turn camera off" : "Turn camera on"} style={{ color: video ? "#fff" : "#9ca3af", background: video ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.12)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 0, width: 52, height: 52 }}>
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>

                        <IconButton onClick={handleEndCall} aria-label="End call" style={{ color: "#fff", background: "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", borderRadius: 0, width: 56, height: 56, boxShadow: "0 0 24px rgba(239,68,68,0.35)" }}>
                            <CallEndIcon />
                        </IconButton>

                        <IconButton onClick={handleAudio} aria-label={audio ? "Mute microphone" : "Unmute microphone"} style={{ color: audio ? "#fff" : "#9ca3af", background: audio ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.12)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 0, width: 52, height: 52 }}>
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable &&
                            <IconButton onClick={handleScreen} aria-label={screen ? "Stop sharing screen" : "Share screen"} style={{ color: screen ? "#121212" : "#fff", background: screen ? "#ffffff" : "rgba(255,255,255,0.06)", border: `1px solid ${screen ? "#ffffff" : "rgba(255,255,255,0.08)"}`, borderRadius: 0, width: 52, height: 52 }}>
                                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                            </IconButton>
                        }

                        <Badge badgeContent={newMessages} max={999} sx={{ '& .MuiBadge-badge': { background: '#ffffff', color: '#121212', fontFamily: 'var(--font-mono)', fontWeight: 700, borderRadius: 0 } }}>
                            <IconButton onClick={() => { setModal(!showModal); setNewMessages(0); }} aria-label={showModal ? "Hide chat" : "Show chat"} style={{ color: showModal ? "#121212" : "#fff", background: showModal ? "#ffffff" : "rgba(255,255,255,0.06)", border: `1px solid ${showModal ? "#ffffff" : "rgba(255,255,255,0.08)"}`, borderRadius: 0, width: 52, height: 52 }}>
                                <ChatIcon />
                            </IconButton>
                        </Badge>
                    </div>

                    {/* Self-view pip — position:absolute comes from CSS, relative needed for inner badge */}
                    <div className={styles.meetUserVideo} style={{ padding:0, overflow:'hidden', position:'absolute' }}>
                        {/* Always render video so ref stays attached; hide via CSS when cam off */}
                        <video
                            ref={localVideoref}
                            autoPlay
                            muted
                            playsInline
                            style={{
                                position:'absolute', inset:0,
                                width:'100%', height:'100%',
                                objectFit:'cover',
                                opacity: video ? 1 : 0,
                                borderRadius:0
                            }}
                        />
                        {/* Camera off placeholder — sits under the video when cam is on */}
                        <div style={{
                            position:'absolute', inset:0,
                            display:'flex', flexDirection:'column',
                            alignItems:'center', justifyContent:'center', gap:6,
                            background:'#0e0e0e',
                            opacity: video ? 0 : 1,
                            transition:'opacity 0.2s'
                        }}>
                            <span style={{ fontSize:9, letterSpacing:'0.3em', color:'rgba(255,255,255,0.35)', fontFamily:'var(--font-mono)', textTransform:'uppercase' }}>CAM OFF</span>
                        </div>
                        {/* Mic muted badge */}
                        {!audio && (
                            <div style={{
                                position:'absolute', top:6, right:6,
                                width:22, height:22, borderRadius:'50%',
                                background:'rgba(239,68,68,0.85)',
                                display:'flex', alignItems:'center', justifyContent:'center',
                                fontSize:11, backdropFilter:'blur(4px)', zIndex:2
                            }}>
                                🔇
                            </div>
                        )}
                        {/* Your name on pip */}
                        <div style={{
                            position:'absolute', bottom:6, left:8,
                            fontSize:8, fontWeight:700,
                            letterSpacing:'0.18em',
                            textTransform:'uppercase',
                            color:'rgba(255,255,255,0.85)',
                            fontFamily:'var(--font-mono)',
                            background:'rgba(0,0,0,0.5)',
                            backdropFilter:'blur(4px)',
                            borderRadius:0,
                            padding:'3px 8px',
                            zIndex:2,
                            maxWidth:'80%',
                            overflow:'hidden',
                            textOverflow:'ellipsis',
                            whiteSpace:'nowrap'
                        }}>
                            {username || "You"}
                        </div>
                    </div>

                    <div className={styles.conferenceView}>
                        {videos.map((video) => (
                            <div key={video.socketId} style={{ position:'relative', width:'100%', height:'100%', minHeight:0, overflow:'hidden' }}>
                                <video
                                    data-socket={video.socketId}
                                    ref={ref => {
                                        if (ref && video.stream) {
                                            ref.srcObject = video.stream;
                                        }
                                    }}
                                    autoPlay
                                    playsInline
                                    style={{ width:'100%', height:'100%', borderRadius:0, objectFit:'contain', background:'#0e0e0e', display:'block' }}
                                />
                                {/* Name badge */}
                                <div style={{
                                    position:'absolute', bottom:12, left:12,
                                    background:'rgba(0,0,0,0.6)',
                                    backdropFilter:'blur(8px)',
                                    border:'1px solid rgba(255,255,255,0.12)',
                                    borderRadius:0,
                                    padding:'5px 11px',
                                    fontSize:9,
                                    fontWeight:700,
                                    letterSpacing:'0.2em',
                                    textTransform:'uppercase',
                                    color:'#ffffff',
                                    fontFamily:'var(--font-mono)',
                                    maxWidth:'70%',
                                    overflow:'hidden',
                                    textOverflow:'ellipsis',
                                    whiteSpace:'nowrap'
                                }}>
                                    {video.username || "Anonymous"}
                                </div>
                            </div>
                        ))}
                    </div>

                </div>

            }

        </div>
    )
}
