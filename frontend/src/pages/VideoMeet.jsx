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

const server_url = server;

var connections = {};

const peerConfigConnections = {
    "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" }
    ]
}

export default function VideoMeetComponent() {

    var socketRef = useRef();
    let socketIdRef = useRef();

    let localVideoref = useRef();

    let [videoAvailable, setVideoAvailable] = useState(true);

    let [audioAvailable, setAudioAvailable] = useState(true);

    let [video, setVideo] = useState(true);

    let [audio, setAudio] = useState(true);

    let [screen, setScreen] = useState(false);

    let [showModal, setModal] = useState(true);

    let [screenAvailable, setScreenAvailable] = useState(false);

    let [messages, setMessages] = useState([])

    let [message, setMessage] = useState("");

    let [newMessages, setNewMessages] = useState(0);

    let [askForUsername, setAskForUsername] = useState(true);

    let [username, setUsername] = useState(localStorage.getItem("meetUsername") || "");
    const myUsernameRef = useRef(localStorage.getItem("meetUsername") || "");

    const videoRef = useRef([])

    let [videos, setVideos] = useState([])

    // Camera+mic stream stays here even while screen sharing, so we can swap back
    const cameraStreamRef = useRef(null);
    const screenStreamRef = useRef(null);

    // ICE candidates that arrive before the remote description is set
    const pendingIceRef = useRef({});

    useEffect(() => {
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

        setVideoAvailable(camAvailable);
        setAudioAvailable(micAvailable);
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

    // Acquire (or reuse) the local stream FIRST, then join the room.
    // Joining before media is ready is what caused offers to be sent with
    // tracks that immediately got stopped, breaking the peer connection.
    const getMedia = async () => {
        let stream = window.localStream;
        const usable = stream && stream.active && stream.getTracks().some(track => track.readyState === 'live');

        if (!usable && (videoAvailable || audioAvailable)) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: videoAvailable, audio: audioAvailable });
            } catch (e) {
                console.log(e);
                stream = null;
            }
        }

        if (!stream || !stream.active) {
            stream = new MediaStream([black(), silence()]);
        }

        window.localStream = stream;
        cameraStreamRef.current = stream;
        if (localVideoref.current) {
            localVideoref.current.srcObject = stream;
        }

        connectToSocketServer();
    }

    const createPeerConnection = (socketListId, nameMap) => {
        const pc = new RTCPeerConnection(peerConfigConnections);
        connections[socketListId] = pc;

        pc.onicecandidate = function (event) {
            if (event.candidate != null) {
                socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }))
            }
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
    let handleAudio = () => {
        const next = !audio;
        setAudio(next);
        try {
            window.localStream.getAudioTracks().forEach(track => track.enabled = next);
        } catch (e) { console.log(e) }
    }

    const replaceOutgoingVideoTrack = (track) => {
        for (let id in connections) {
            const sender = connections[id].getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(track).catch(e => console.log(e));
        }
    }

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
        localStorage.setItem("meetUsername", name);
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
                        <div style={{ display:'flex', alignItems:'center', gap:10, fontFamily:"'Clash Display',sans-serif", fontSize:'1.4rem', fontWeight:800, letterSpacing:'-0.02em' }}>
                            <div className="logo-icon">⚡</div>
                            Nexus
                        </div>

                        <div className="lobby-preview">
                            <video ref={localVideoref} autoPlay muted style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:0 }} />
                        </div>

                        <div style={{ textAlign:'center' }}>
                            <h2 style={{ fontFamily:"'Clash Display',sans-serif", fontSize:'1.5rem', fontWeight:800, letterSpacing:'-0.02em', marginBottom:6 }}>Ready to join?</h2>
                            <p style={{ fontSize:'0.9rem', color:'var(--muted)' }}>Enter your display name to continue</p>
                        </div>

                        <input
                            className="nexus-input"
                            style={{ width:'100%', padding:'14px 18px', fontSize:'15px' }}
                            placeholder="Your display name"
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

                    {showModal ? <div className={styles.chatRoom}>

                        <div className={styles.chatContainer}>
                            <h1>Chat</h1>

                            <div className={styles.chattingDisplay}>

                                {messages.length !== 0 ? messages.map((item, index) => {
                                    const isMe = item.fromMe === true;
                                    return (
                                        <div key={index} style={{ display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                                            <span style={{ fontSize:11, fontWeight:700, color: isMe ? 'var(--green2)' : 'var(--amber2)', marginBottom:4, letterSpacing:'0.03em' }}>
                                                {isMe ? 'You' : item.sender}
                                            </span>
                                            <div style={{
                                                maxWidth:'85%',
                                                padding:'9px 13px',
                                                borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                                background: isMe ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
                                                border: `1px solid ${isMe ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)'}`,
                                                fontSize:14,
                                                lineHeight:1.45,
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
                        <IconButton onClick={handleVideo} style={{ color: video ? "#fff" : "#9ca3af", background: video ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.12)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", width: 52, height: 52 }}>
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>

                        <IconButton onClick={handleEndCall} style={{ color: "#fff", background: "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", borderRadius: "16px", width: 56, height: 56, boxShadow: "0 0 24px rgba(239,68,68,0.45)" }}>
                            <CallEndIcon />
                        </IconButton>

                        <IconButton onClick={handleAudio} style={{ color: audio ? "#fff" : "#9ca3af", background: audio ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.12)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", width: 52, height: 52 }}>
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable &&
                            <IconButton onClick={handleScreen} style={{ color: screen ? "#34d399" : "#fff", background: screen ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)", border: `1px solid ${screen ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius: "16px", width: 52, height: 52 }}>
                                {screen ? <ScreenShareIcon /> : <StopScreenShareIcon />}
                            </IconButton>
                        }

                        <Badge badgeContent={newMessages} max={999} color="success">
                            <IconButton onClick={() => { setModal(!showModal); setNewMessages(0); }} style={{ color: showModal ? "#34d399" : "#fff", background: showModal ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)", border: `1px solid ${showModal ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius: "16px", width: 52, height: 52 }}>
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
                            alignItems:'center', justifyContent:'center', gap:4,
                            background:'#0d1410',
                            opacity: video ? 0 : 1,
                            transition:'opacity 0.2s'
                        }}>
                            <span style={{ fontSize:26 }}>🎥</span>
                            <span style={{ fontSize:10, color:'rgba(255,255,255,0.35)', fontFamily:"'DM Sans',sans-serif" }}>Cam off</span>
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
                            fontSize:10, fontWeight:600,
                            color:'rgba(240,250,245,0.85)',
                            fontFamily:"'DM Sans',sans-serif",
                            background:'rgba(0,0,0,0.45)',
                            backdropFilter:'blur(4px)',
                            borderRadius:5,
                            padding:'2px 7px',
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
                            <div key={video.socketId} style={{ position:'relative', width:'100%', maxWidth:560 }}>
                                <video
                                    data-socket={video.socketId}
                                    ref={ref => {
                                        if (ref && video.stream) {
                                            ref.srcObject = video.stream;
                                        }
                                    }}
                                    autoPlay
                                    playsInline
                                    style={{ width:'100%', aspectRatio:'16/9', borderRadius:18, objectFit:'cover', background:'#0d1410', display:'block' }}
                                />
                                {/* Name badge */}
                                <div style={{
                                    position:'absolute', bottom:12, left:12,
                                    background:'rgba(0,0,0,0.55)',
                                    backdropFilter:'blur(8px)',
                                    border:'1px solid rgba(255,255,255,0.1)',
                                    borderRadius:8,
                                    padding:'4px 10px',
                                    fontSize:12,
                                    fontWeight:600,
                                    color:'#f0faf5',
                                    fontFamily:"'DM Sans',sans-serif",
                                    letterSpacing:'0.01em',
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
