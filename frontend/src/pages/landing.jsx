import React from 'react'
import "../App.css"
import { Link, useNavigate } from 'react-router-dom'

export default function LandingPage() {
    const router = useNavigate();

    return (
        <div className="landing">
            {/* Acid green glow orb */}
            <div className="orb orb-green"  style={{ width:700, height:700, bottom:'-200px', right:'-150px', opacity:0.12 }} />
            <div className="orb orb-purple" style={{ width:400, height:400, top:'-100px', left:'-100px', opacity:0.08 }} />

            {/* Tunnel text background */}
            <div className="tunnel-wrap">
                <div className="tunnel-text">
                    <div className="tunnel-row">CONNECT</div>
                    <div className="tunnel-row">VIDEO · CALL</div>
                    <div className="tunnel-row">NEXUS</div>
                    <div className="tunnel-row">CONNECT</div>
                    <div className="tunnel-row">VIDEO · CALL</div>
                    <div className="tunnel-row">NEXUS</div>
                </div>
            </div>

            {/* Navbar */}
            <nav className="landing-nav">
                <Link to="/" className="landing-logo">
                    <div className="logo-icon">⚡</div>
                    Nexus
                </Link>
                <div className="landing-nav-links">
                    <button className="nav-link" onClick={() => router("/aljk23")}>Join as Guest</button>
                    <Link to="/auth" className="btn-ghost" style={{ padding:'9px 20px', fontSize:'13px' }}>Log in</Link>
                    <Link to="/auth" className="btn-glow" style={{ padding:'9px 20px', fontSize:'15px' }}>Get started →</Link>
                </div>
            </nav>

            {/* Hero */}
            <div className="landing-hero">
                <div className="hero-left">
                    <div className="hero-badge fade-up">
                        <span className="hero-badge-dot" />
                        Now in beta · Free to use
                    </div>

                    <h1 className="hero-h1 fade-up-2">
                        Video calls,<br />
                        <span className="accent" style={{ color:'#39ff14' }}>reimagined.</span>
                    </h1>

                    <p className="hero-sub fade-up-3">
                        Crystal-clear peer-to-peer video meetings with real-time collaboration.
                        No downloads. No friction. Just connect.
                    </p>

                    <div className="hero-cta fade-up-4">
                        <Link to="/auth" className="btn-glow">Start for free →</Link>
                        <button className="btn-ghost" onClick={() => router("/aljk23")}>Join as guest</button>
                    </div>
                </div>

                <div className="hero-right fade-up-2">
                    <div className="mock-card">
                        <div className="mock-top-bar">
                            <div className="mock-dot" />
                            <div className="mock-dot" />
                            <div className="mock-dot" />
                            <span className="mock-title">⚡ Nexus · Meeting in progress</span>
                        </div>
                        <div className="mock-body">
                            {[
                                { emoji: '🧑‍💻', label: 'Aayush' },
                                { emoji: '👩‍🎨', label: 'Sara' },
                                { emoji: '🧑‍🚀', label: 'Dev' },
                                { emoji: '👨‍🔬', label: 'Raj' },
                            ].map((p, i) => (
                                <div className="mock-tile" key={i}>
                                    <div className="mock-avatar">{p.emoji}</div>
                                    <span>{p.label}</span>
                                </div>
                            ))}
                        </div>
                        <div className="mock-controls">
                            <div className="mock-btn">🎤</div>
                            <div className="mock-btn">📷</div>
                            <div className="mock-btn end">📵</div>
                            <div className="mock-btn">💬</div>
                            <div className="mock-btn">🖥️</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Features strip */}
            <div className="landing-features">
                {[
                    { icon: '🔒', label: 'End-to-end encrypted' },
                    { icon: '⚡', label: 'Ultra-low latency' },
                    { icon: '🌍', label: 'Works anywhere' },
                    { icon: '💬', label: 'Built-in live chat' },
                    { icon: '🖥️', label: 'Screen sharing' },
                ].map((f, i) => (
                    <div className="feature-item" key={i}>
                        <div className="feature-icon">{f.icon}</div>
                        {f.label}
                    </div>
                ))}
            </div>
        </div>
    )
}
