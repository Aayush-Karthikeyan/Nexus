import React, { useContext, useState } from 'react'
import withAuth from '../utils/withAuth'
import { useNavigate, Link } from 'react-router-dom'
import "../App.css";
import { AuthContext } from '../contexts/AuthContext';

function HomeComponent() {
    let navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState("");
    const { addToUserHistory } = useContext(AuthContext);

    const handleJoinVideoCall = async () => {
        if (!meetingCode.trim()) return;
        await addToUserHistory(meetingCode);
        navigate(`/${meetingCode}`);
    };

    const handleNewMeeting = () => {
        const code = Math.random().toString(36).substring(2, 10);
        navigate(`/${code}`);
    };

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="home-page">
            {/* Orbs */}
            <div className="orb orb-purple" style={{ width: 500, height: 500, top: '-180px', right: '-100px', opacity: 0.15 }} />
            <div className="orb orb-blue"   style={{ width: 400, height: 400, bottom: '-120px', left: '-80px', opacity: 0.12 }} />

            {/* Navbar */}
            <nav className="home-nav">
                <Link to="/" className="landing-logo" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="logo-icon">⚡</div>
                    Nexus
                </Link>
                <div className="home-nav-right">
                    <Link to="/history" className="icon-btn" title="History">🕐</Link>
                    <button
                        className="btn-ghost"
                        style={{ padding: '9px 20px', fontSize: '14px' }}
                        onClick={() => { localStorage.removeItem("token"); navigate("/auth"); }}
                    >
                        Sign out
                    </button>
                </div>
            </nav>

            {/* Body */}
            <div className="home-body">
                <div className="home-greeting fade-up">
                    <h1>{greeting} 👋</h1>
                    <p>What would you like to do today?</p>
                </div>

                <div className="home-cards fade-up-2">
                    {/* New Meeting */}
                    <div className="action-card" onClick={handleNewMeeting}>
                        <div className="card-icon-wrap purple">🎥</div>
                        <div>
                            <h3>New Meeting</h3>
                            <p>Start an instant meeting and invite others with a link.</p>
                        </div>
                        <span className="btn-glow" style={{ alignSelf: 'flex-start', padding: '10px 22px', fontSize: '14px' }}>
                            Start now →
                        </span>
                    </div>

                    {/* Join Meeting */}
                    <div className="action-card join-card">
                        <div className="card-icon-wrap blue">🔗</div>
                        <div>
                            <h3>Join Meeting</h3>
                            <p>Enter a meeting code to join an existing call.</p>
                        </div>
                        <div className="join-input-row">
                            <input
                                className="nexus-input"
                                placeholder="Enter meeting code"
                                value={meetingCode}
                                onChange={e => setMeetingCode(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleJoinVideoCall()}
                            />
                            <button className="btn-small" onClick={handleJoinVideoCall}>Join</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default withAuth(HomeComponent)