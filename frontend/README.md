# Nexus — Frontend

React 18 client for Nexus. Handles the landing page, authentication, meeting
lobby, and the WebRTC call interface.

**Full project documentation — architecture, WebRTC flow, and setup — lives in
the [root README](../README.md).**

## Quick start

```bash
npm install
npm start
```

Runs at `http://localhost:3000`. Expects the backend at `http://localhost:8000`
(see [`../backend`](../backend)).

## Configuration

Copy `.env.example` to `.env` and set the backend URL:

```env
REACT_APP_BACKEND_URL=http://localhost:8000
```

Unset, the app falls back to `http://localhost:8000`. On Vercel this points at
the deployed Render backend.

## Scripts

| Command | Description |
|---|---|
| `npm start` | Development server with hot reload |
| `npm run build` | Production bundle into `build/` |
| `npm test` | Jest + React Testing Library |

## Structure

```
src/
├── pages/
│   ├── landing.jsx         Landing page
│   ├── home.jsx            Start or join a meeting
│   ├── VideoMeet.jsx       Core video-call interface
│   ├── authentication.jsx  Registration and login
│   └── history.jsx         Previous meetings
├── contexts/
│   └── AuthContext.jsx     Authentication state and API calls
├── utils/
│   └── withAuth.jsx        Route guard for protected pages
└── styles/
    └── videoComponent.module.css
```

Built with Create React App.
