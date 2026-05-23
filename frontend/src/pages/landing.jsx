import React from 'react'
import "../App.css"
import { Link, useNavigate } from 'react-router-dom'

export default function LandingPage() {
    const router = useNavigate();

    return (
        <div className="landing">
            {/* Animated orbs */}
            <div className="orb orb-purple" style={{ width: 600, height: 600, top: '-200px', left: '-150px' }} />
            <div className="orb orb-blue"   style={{ width: 500, height: 500, bottom: '-100px', right: '-100px' }} />
            <div className="orb orb-pink"   style={{ width: 350, height: 350, top: '40%', left: '45%' }} />

            {/* Navbar */}
            <nav className="landing-nav">
                <Link to="/" className="landing-logo">
                    <div className="logo-icon">⚡</div>
                    Nexus
                </Link>
                <div className="landing-nav-links">
                    <button className="nav-link" onClick={() => router("/aljk23")}>Join as Guest</button>
                    <Link to="/auth" className="btn-ghost" style={{ padding: '10px 22px', fontSize: '14px' }}>Log in</Link>
                    <Link to="/auth" className="btn-glow" style={{ padding: '10px 22px', fontSize: '14px' }}>Get started →</Link>
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
                        <span className="grad-text">Video calls,</span><br />
                        reimagined.
                    </h1>

                    <p className="hero-sub fade-up-3">
                        Crystal-clear video meetings with real-time collaboration.
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
                                { emoji: '🧑‍💻', label: 'Aayush', },
                                { emoji: '👩‍🎨', label: 'Sara', },
                                { emoji: '🧑‍🚀', label: 'Dev', },
                                { emoji: '👨‍🔬', label: 'Raj', },
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
