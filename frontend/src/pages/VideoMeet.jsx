import React, { useEffect, useRef, useState } from 'react'
import io from "socket.io-client";
import { Badge, IconButton, TextField } from '@mui/material';
import { Button } from '@mui/material';
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

    let [video, setVideo] = useState([]);

    let [audio, setAudio] = useState();

    let [screen, setScreen] = useState();

    let [showModal, setModal] = useState(true);

    let [screenAvailable, setScreenAvailable] = useState();

    let [messages, setMessages] = useState([])

    let [message, setMessage] = useState("");

    let [newMessages, setNewMessages] = useState(0);

    let [askForUsername, setAskForUsername] = useState(true);

    let [username, setUsername] = useState("");

    const videoRef = useRef([])

    let [videos, setVideos] = useState([])

    // TODO
    // if(isChrome() === false) {


    // }

    useEffect(() => {
        getPermissions();
    }, [])  // empty deps — run once only, fixes flicker

    let getDislayMedia = () => {
        if (screen) {
            if (navigator.mediaDevices.getDisplayMedia) {
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(getDislayMediaSuccess)
                    .then((stream) => { })
                    .catch((e) => console.log(e))
            }
        }
    }

    const getPermissions = async () => {
        try {
            const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoPermission) {
                setVideoAvailable(true);
                console.log('Video permission granted');
            } else {
                setVideoAvailable(false);
                console.log('Video permission denied');
            }

            const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (audioPermission) {
                setAudioAvailable(true);
                console.log('Audio permission granted');
            } else {
                setAudioAvailable(false);
                console.log('Audio permission denied');
            }

            if (navigator.mediaDevices.getDisplayMedia) {
                setScreenAvailable(true);
            } else {
                setScreenAvailable(false);
            }

            if (videoAvailable || audioAvailable) {
                const userMediaStream = await navigator.mediaDevices.getUserMedia({ video: videoAvailable, audio: audioAvailable });
                if (userMediaStream) {
                    window.localStream = userMediaStream;
                    if (localVideoref.current) {
                        localVideoref.current.srcObject = userMediaStream;
                    }
                }
            }
        } catch (error) {
            console.log(error);
        }
    };

    useEffect(() => {
        if (video !== undefined && audio !== undefined) {
            getUserMedia();
            console.log("SET STATE HAS ", video, audio);

        }


    }, [video, audio])
    let getMedia = () => {
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        connectToSocketServer();

    }




    let getUserMediaSuccess = (stream) => {
        try {
            window.localStream.getTracks().forEach(track => track.stop())
        } catch (e) { console.log(e) }

        window.localStream = stream
        localVideoref.current.srcObject = stream

        for (let id in connections) {
            if (id === socketIdRef.current) continue

            connections[id].addStream(window.localStream)

            connections[id].createOffer().then((description) => {
                console.log(description)
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
                    })
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setVideo(false);
            setAudio(false);

            try {
                let tracks = localVideoref.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            localVideoref.current.srcObject = window.localStream

            for (let id in connections) {
                connections[id].addStream(window.localStream)

                connections[id].createOffer().then((description) => {
                    connections[id].setLocalDescription(description)
                        .then(() => {
                            socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
                        })
                        .catch(e => console.log(e))
                })
            }
        })
    }

    let getUserMedia = () => {
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            navigator.mediaDevices.getUserMedia({ video: video, audio: audio })
                .then(getUserMediaSuccess)
                .then((stream) => { })
                .catch((e) => console.log(e))
        } else {
            try {
                let tracks = localVideoref.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (e) { }
        }
    }





    let getDislayMediaSuccess = (stream) => {
        console.log("HERE")
        try {
            window.localStream.getTracks().forEach(track => track.stop())
        } catch (e) { console.log(e) }

        window.localStream = stream
        localVideoref.current.srcObject = stream

        for (let id in connections) {
            if (id === socketIdRef.current) continue

            connections[id].addStream(window.localStream)

            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
                    })
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setScreen(false)

            try {
                let tracks = localVideoref.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            localVideoref.current.srcObject = window.localStream

            getUserMedia()

        })
    }

    let gotMessageFromServer = (fromId, message) => {
        var signal = JSON.parse(message)

        if (fromId !== socketIdRef.current) {
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === 'offer') {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', fromId, JSON.stringify({ 'sdp': connections[fromId].localDescription }))
                            }).catch(e => console.log(e))
                        }).catch(e => console.log(e))
                    }
                }).catch(e => console.log(e))
            }

            if (signal.ice) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e))
            }
        }
    }




    let connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: false })

        socketRef.current.on('signal', gotMessageFromServer)

        socketRef.current.on('connect', () => {
            socketRef.current.emit('join-call', window.location.href)
            socketIdRef.current = socketRef.current.id

            socketRef.current.on('chat-message', addMessage)

            socketRef.current.on('user-left', (id) => {
                setVideos((videos) => videos.filter((video) => video.socketId !== id))
            })

            socketRef.current.on('user-joined', (id, clients) => {
                clients.forEach((socketListId) => {

                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections)
                    // Wait for their ice candidate       
                    connections[socketListId].onicecandidate = function (event) {
                        if (event.candidate != null) {
                            socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }))
                        }
                    }

                    // Wait for their video stream
                    connections[socketListId].onaddstream = (event) => {
                        console.log("BEFORE:", videoRef.current);
                        console.log("FINDING ID: ", socketListId);

                        let videoExists = videoRef.current.find(video => video.socketId === socketListId);

                        if (videoExists) {
                            console.log("FOUND EXISTING");

                            // Update the stream of the existing video
                            setVideos(videos => {
                                const updatedVideos = videos.map(video =>
                                    video.socketId === socketListId ? { ...video, stream: event.stream } : video
                                );
                                videoRef.current = updatedVideos;
                                return updatedVideos;
                            });
                        } else {
                            // Create a new video
                            console.log("CREATING NEW");
                            let newVideo = {
                                socketId: socketListId,
                                stream: event.stream,
                                autoplay: true,
                                playsinline: true
                            };

                            setVideos(videos => {
                                const updatedVideos = [...videos, newVideo];
                                videoRef.current = updatedVideos;
                                return updatedVideos;
                            });
                        }
                    };


                    // Add the local video stream
                    if (window.localStream !== undefined && window.localStream !== null) {
                        connections[socketListId].addStream(window.localStream)
                    } else {
                        let blackSilence = (...args) => new MediaStream([black(...args), silence()])
                        window.localStream = blackSilence()
                        connections[socketListId].addStream(window.localStream)
                    }
                })

                if (id === socketIdRef.current) {
                    for (let id2 in connections) {
                        if (id2 === socketIdRef.current) continue

                        try {
                            connections[id2].addStream(window.localStream)
                        } catch (e) { }

                        connections[id2].createOffer().then((description) => {
                            connections[id2].setLocalDescription(description)
                                .then(() => {
                                    socketRef.current.emit('signal', id2, JSON.stringify({ 'sdp': connections[id2].localDescription }))
                                })
                                .catch(e => console.log(e))
                        })
                    }
                }
            })
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

    let handleVideo = () => {
        setVideo(!video);
        // getUserMedia();
    }
    let handleAudio = () => {
        setAudio(!audio)
        // getUserMedia();
    }

    useEffect(() => {
        if (screen !== undefined) {
            getDislayMedia();
        }
    }, [screen])
    let handleScreen = () => {
        setScreen(!screen);
    }

    let handleEndCall = () => {
        try {
            let tracks = localVideoref.current.srcObject.getTracks()
            tracks.forEach(track => track.stop())
        } catch (e) { }
        window.location.href = "/"
    }

    let openChat = () => {
        setModal(true);
        setNewMessages(0);
    }
    let closeChat = () => {
        setModal(false);
    }
    let handleMessage = (e) => {
        setMessage(e.target.value);
    }

    const addMessage = (data, sender, socketIdSender) => {
        // Skip messages from yourself — we already added them locally in sendMessage
        if (socketIdSender === socketIdRef.current) return;
        setMessages((prevMessages) => [
            ...prevMessages,
            { sender: sender, data: data }
        ]);
        setNewMessages((prevNewMessages) => prevNewMessages + 1);
    };



    let sendMessage = () => {
        if (!message.trim()) return;
        const displayName = username.trim() || "Anonymous";
        socketRef.current.emit('chat-message', message, displayName);
        // Also add to own messages immediately so sender sees it instantly
        setMessages(prev => [...prev, { sender: displayName, data: message }]);
        setMessage("");
    }

    
    let connect = () => {
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
                                    const isMe = item.sender === (username.trim() || "Anonymous");
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

                    {/* Self-view pip — always mounted so ref stays attached */}
                    <div className={styles.meetUserVideo} style={{ padding:0, overflow:'hidden' }}>
                        <video ref={localVideoref} autoPlay muted style={{ width:'100%', height:'100%', objectFit:'cover', display: video ? 'block' : 'none', borderRadius:0 }} />
                        {/* Camera off tile */}
                        {!video && (
                            <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, background:'#0d1410' }}>
                                <span style={{ fontSize:26 }}>🎥</span>
                                <span style={{ fontSize:10, color:'rgba(255,255,255,0.35)', fontFamily:"'DM Sans',sans-serif" }}>Cam off</span>
                            </div>
                        )}
                        {/* Mic muted overlay badge */}
                        {!audio && (
                            <div style={{ position:'absolute', top:6, right:6, width:22, height:22, borderRadius:'50%', background:'rgba(239,68,68,0.85)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, backdropFilter:'blur(4px)' }}>
                                🔇
                            </div>
                        )}
                    </div>

                    <div className={styles.conferenceView}>
                        {videos.map((video) => (
                            <div key={video.socketId}>
                                <video

                                    data-socket={video.socketId}
                                    ref={ref => {
                                        if (ref && video.stream) {
                                            ref.srcObject = video.stream;
                                        }
                                    }}
                                    autoPlay
                                >
                                </video>
                            </div>

                        ))}

                    </div>

                </div>

            }

        </div>
    )
}
