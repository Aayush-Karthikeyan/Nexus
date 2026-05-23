# 🎥 Zoom Clone

A full-stack video calling web application inspired by Zoom, built with React, Node.js, and real-time communication via Socket.io.

## ✨ Features

- 🔐 User authentication (Sign Up / Sign In)
- 📹 Real-time video & audio calling via WebRTC
- 🔗 Shareable meeting room links
- 💬 In-meeting controls (mute, camera toggle)
- 📋 Meeting history tracking
- 👤 Join as guest (no account needed)

## 🛠 Tech Stack

**Frontend**
- React 18
- Material UI (MUI)
- Socket.io Client
- React Router v6
- Axios

**Backend**
- Node.js + Express
- Socket.io
- MongoDB + Mongoose
- bcrypt (password hashing)

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- MongoDB (local or Atlas)

### 1. Clone the repo
```bash
git clone https://github.com/Aayush-Karthikeyan/Zoom-Clone.git
cd Zoom-Clone
```

### 2. Start the Backend
```bash
cd backend
npm install
npm run dev
```
Runs on **http://localhost:8000**

### 3. Start the Frontend
```bash
cd frontend
npm install
npm start
```
Runs on **http://localhost:3000**

## 📁 Project Structure

```
Zoom-Clone/
├── backend/
│   └── src/
│       ├── controllers/    # Socket & user logic
│       ├── models/         # Mongoose schemas
│       ├── routes/         # API routes
│       └── app.js          # Entry point
└── frontend/
    └── src/
        ├── contexts/       # Auth context
        ├── pages/          # Landing, Auth, Home, Meet, History
        ├── styles/         # CSS modules
        └── utils/          # Auth HOC
```

## 📄 License

MIT
