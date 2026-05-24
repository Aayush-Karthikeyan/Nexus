# Nexus — Video Calls, Reimagined.

> Peer-to-peer video conferencing built with WebRTC, Socket.io, React, and Node.js.

**[Live Demo](https://nexus-app-aayush.vercel.app)** · **[GitHub](https://github.com/Aayush-Karthikeyan/Nexus)**

---

## Overview

Nexus is a full-stack real-time video conferencing application. Users can start instant meetings, share links to invite others, and communicate via live chat — all in the browser with no downloads required.

Built to understand the fundamentals of real-time peer-to-peer communication using WebRTC, including the full SDP offer/answer signaling flow and ICE candidate negotiation over a Socket.io signaling server.

---

## Features

- **Peer-to-peer video calls** via WebRTC — direct browser-to-browser streaming
- **Real-time chat** with iMessage-style bubbles per participant
- **Screen sharing** support
- **Participant name badges** on each video tile
- **Camera & mic controls** with visual indicators
- **Meeting history** — past calls saved per account
- **Guest access** — join without an account
- **Instant meeting links** — copy and share in one click
- **User authentication** — register/login with hashed passwords

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router v6 |
| Real-time | Socket.io, WebRTC (RTCPeerConnection) |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Auth | bcrypt password hashing, JWT tokens |
| Deployment | Vercel (frontend), Render (backend), MongoDB Atlas |
| Fonts | Bebas Neue, Space Grotesk |

---

## Architecture

```
Browser A                    Signaling Server              Browser B
   |                        (Node + Socket.io)                |
   |── join-call ─────────────────►|                          |
   |                               |◄──────── join-call ──────|
   |◄────────── user-joined ───────|─────── user-joined ─────►|
   |                               |                          |
   |── SDP Offer (signal) ─────────────────────────────────► |
   |◄────────────────────── SDP Answer (signal) ─────────────|
   |── ICE candidates ────────────────────────────────────── |
   |◄─────────────────────── ICE candidates ─────────────────|
   |                                                          |
   |◄══════════════ P2P Video/Audio Stream ══════════════════►|
```

The signaling server (Socket.io) only handles the initial handshake — once the WebRTC connection is established, all media flows directly peer-to-peer with zero server involvement.

---

## How WebRTC Works (the short version)

1. **Signaling** — peers exchange session descriptions (SDP) via the Socket.io server to agree on codecs and connection parameters
2. **ICE** — the browser uses STUN to discover its public IP, then tries to find a direct path between peers
3. **Stream** — once connected, video/audio streams directly between browsers — the server is no longer involved

---

## Running Locally

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)

### 1. Clone the repo
```bash
git clone https://github.com/Aayush-Karthikeyan/Nexus.git
cd Nexus
```

### 2. Backend setup
```bash
cd backend
npm install
```

Create a `.env` file in `/backend`:
```
MONGO_URI=your_mongodb_atlas_connection_string
PORT=8000
```

Start the backend:
```bash
npm run dev
```

### 3. Frontend setup
```bash
cd frontend
npm install
npm start
```

App runs at `http://localhost:3000`. Backend runs at `http://localhost:8000`.

---

## Project Structure

```
Nexus/
├── backend/
│   └── src/
│       ├── app.js                  # Express server + Socket.io setup
│       ├── controllers/
│       │   ├── socketManager.js    # WebRTC signaling, chat, room management
│       │   └── user.controller.js  # Auth — register, login, history
│       ├── models/
│       │   ├── user.model.js
│       │   └── meeting.model.js
│       └── routes/
│           └── users.routes.js
└── frontend/
    └── src/
        ├── pages/
        │   ├── landing.jsx         # Landing page
        │   ├── home.jsx            # Dashboard — start/join meeting
        │   ├── VideoMeet.jsx       # Core video call component
        │   ├── authentication.jsx  # Login/register
        │   └── history.jsx         # Meeting history
        ├── contexts/
        │   └── AuthContext.jsx     # Auth state + API calls
        └── styles/
            └── videoComponent.module.css
```

---

## Known Limitations

- **TURN server** — cross-network video requires a TURN relay server for peers behind strict firewalls/NAT. Currently using Google's free STUN server which works for most same-network scenarios. A TURN server would be the next step for production reliability.
- **Mesh topology** — each peer connects directly to every other peer. Doesn't scale beyond ~4-5 participants. Production systems use SFUs (Selective Forwarding Units) like mediasoup or LiveKit.
- **Free tier cold starts** — Render backend may take ~30s to wake up after inactivity.

---

## What I Learned

- Full WebRTC signaling flow — SDP offer/answer exchange, ICE candidate negotiation
- Why peer-to-peer still needs a signaling server for the initial handshake
- Socket.io room management and event broadcasting patterns
- React ref patterns for stable values across renders
- The difference between mesh topology and SFU architecture at scale

---

## Author

**Aayush Karthikeyan** — [GitHub](https://github.com/Aayush-Karthikeyan)

---

*Deployed on Vercel + Render + MongoDB Atlas.*
