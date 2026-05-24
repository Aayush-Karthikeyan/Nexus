import React, { useContext, useState, useRef, useCallback } from 'react'
import withAuth from '../utils/withAuth'
import { useNavigate, Link } from 'react-router-dom'
import "../App.css";
import { AuthContext } from '../contexts/AuthContext';

function HomeComponent() {
    let navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState("");
    const [copied, setCopied] = useState(false);
    const { addToUserHistory } = useContext(AuthContext);
    const pageRef = useRef(null);

    const handleMouseMove = useCallback((e) => {
        if (!pageRef.current) return;
        const rect = pageRef.current.getBoundingClientRect();
        pageRef.current.style.setProperty('--x', `${e.clientX - rect.left}px`);
        pageRef.current.style.setProperty('--y', `${e.clientY - rect.top}px`);
    }, []);

    const safeAddHistory = async (code) => {
        try { await addToUserHistory(code); } catch (_) { /* guest — no token, that's fine */ }
    };

    const handleNewMeeting = async () => {
        const code = Math.random().toString(36).substring(2, 10);
        await safeAddHistory(code);
        navigate(`/${code}`);
    };

    const handleCopyLink = async () => {
        const code = Math.random().toString(36).substring(2, 10);
        const link = `${window.location.origin}/${code}`;
        try { await navigator.clipboard.writeText(link); } catch (_) {}
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    const handleJoinVideoCall = async () => {
        const raw = meetingCode.trim();
        if (!raw) return;
        // Support pasting full URL — extract last segment
        const code = raw.includes('/') ? raw.split('/').filter(Boolean).pop() : raw;
        await safeAddHistory(code);
        navigate(`/${code}`);
    };

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="home-page" ref={pageRef} onMouseMove={handleMouseMove}>
            <div className="cursor-spotlight" />

            {/* Navbar */}
            <nav className="home-nav">
                <Link to="/" className="landing-logo" style={{ textDecoration:'none', color:'inherit' }}>
                    <div className="logo-icon">⚡</div>
                    Nexus
                </Link>
                <div className="home-nav-right">
                    <Link to="/history" className="icon-btn" title="History">🕐</Link>
                    <button
                        className="btn-ghost"
                        style={{ padding:'9px 20px', fontSize:'14px' }}
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
                    <div className="action-card">
                        <div className="card-border-line" />
                        <div className="card-icon-wrap green">🎥</div>
                        <div>
                            <h3>New Meeting</h3>
                            <p>Start an instant meeting and share the link with anyone.</p>
                        </div>
                        <div style={{ display:'flex', gap:0, flexWrap:'wrap' }}>
                            <button className="btn-glow" style={{ padding:'11px 24px', fontSize:'15px' }} onClick={handleNewMeeting}>
                                Start now →
                            </button>
                            <button className="btn-ghost" style={{ padding:'11px 18px', fontSize:'13px', marginLeft:8 }} onClick={handleCopyLink}>
                                {copied ? '✅ Copied!' : '🔗 Copy link'}
                            </button>
                        </div>
                        {copied && (
                            <p style={{ fontSize:11, color:'#39ff14', marginTop:-8, fontFamily:"'Space Grotesk',sans-serif", letterSpacing:'0.04em' }}>
                                Link copied — paste it to invite others
                            </p>
                        )}
                    </div>

                    {/* Join Meeting */}
                    <div className="action-card join-card">
                        <div className="card-border-line" />
                        <div className="card-icon-wrap amber">🔗</div>
                        <div>
                            <h3>Join a Meeting</h3>
                            <p>Paste a Nexus link or enter a meeting code to jump in.</p>
                        </div>
                        <div className="join-input-row">
                            <input
                                className="nexus-input"
                                placeholder="Paste link or code"
                                value={meetingCode}
                                onChange={e => setMeetingCode(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleJoinVideoCall()}
                            />
                            <button className="btn-small" onClick={handleJoinVideoCall}>Join →</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default withAuth(HomeComponent)