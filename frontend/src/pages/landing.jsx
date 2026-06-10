import React, { useEffect, useRef, useState } from 'react'
import "../App.css"
import { Link, useNavigate } from 'react-router-dom'

const Wordmark = ({ className = "wordmark" }) => (
    <span className={className}>
        NEXUS<span className="wm-dot" />APP
    </span>
)

export default function LandingPage() {
    const router = useNavigate();

    const [count, setCount] = useState(0);
    const [loaded, setLoaded] = useState(false);     // counter hit 100
    const [gone, setGone] = useState(false);         // preloader unmounted
    const [menuOpen, setMenuOpen] = useState(false);
    const [clock, setClock] = useState("");
    const rafRef = useRef(null);

    // city label from the user's timezone — like "( CALCUTTA )"
    const city = (Intl.DateTimeFormat().resolvedOptions().timeZone || "LOCAL")
        .split("/").pop().replace(/_/g, " ").toUpperCase();

    // 0 → 100 preloader counter
    useEffect(() => {
        const start = performance.now();
        const duration = 1900;
        const tick = (now) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setCount(Math.round(eased * 100));
            if (p < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                setTimeout(() => setLoaded(true), 250);
                setTimeout(() => setGone(true), 1350);
            }
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

    // live clock
    useEffect(() => {
        const update = () => {
            const d = new Date();
            setClock(
                `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
            );
        };
        update();
        const id = setInterval(update, 10000);
        return () => clearInterval(id);
    }, []);

    const guestCode = useRef(Math.random().toString(36).substring(2, 8));
    const joinAsGuest = () => router(`/${guestCode.current}`);

    const menuItems = [
        { num: "01", label: "Start a call", action: () => router("/auth") },
        { num: "02", label: "Join as guest", action: joinAsGuest },
        { num: "03", label: "Log in", action: () => router("/auth") },
        { num: "04", label: "History", action: () => router("/history") },
    ];

    return (
        <div className={`landing ${loaded ? "ready" : ""}`}>

            {/* ── Preloader ── */}
            {!gone && (
                <div className={`preloader ${loaded ? "done" : ""}`}>
                    <div className="preloader-mark">
                        NEXUS<span className="wm-dot" />APP
                    </div>
                    <div className="preloader-count">
                        {String(count).padStart(3, "0")}
                    </div>
                    <div className="preloader-bar" style={{ width: `${count}%` }} />
                </div>
            )}

            {/* ── Fullscreen menu ── */}
            <div className={`menu-overlay ${menuOpen ? "open" : ""}`}>
                <div style={{ position: "absolute", top: 26, left: 44 }}>
                    <Wordmark />
                </div>
                <button
                    className="menu-btn"
                    style={{ position: "absolute", top: 32, right: 44 }}
                    onClick={() => setMenuOpen(false)}
                >
                    Close ✕
                </button>

                {menuItems.map((item) => (
                    <button key={item.num} className="menu-link" onClick={() => { setMenuOpen(false); item.action(); }}>
                        <span className="menu-num">{item.num}</span>
                        <span className="menu-label">{item.label}</span>
                    </button>
                ))}

                <div className="menu-foot">
                    <span>NEXUS — PEER TO PEER VIDEO</span>
                    <span>NO DOWNLOADS · ENCRYPTED · FREE</span>
                </div>
            </div>

            {/* ── Nav ── */}
            <nav className="landing-nav reveal" style={{ transitionDelay: "0.1s" }}>
                <Link to="/" style={{ textDecoration: "none" }}>
                    <Wordmark />
                </Link>
                <div className="nav-clock">( {city} )&nbsp;&nbsp;{clock}</div>
                <button className="menu-btn" onClick={() => setMenuOpen(true)}>Menu</button>
            </nav>

            {/* ── Lens hero ── */}
            <div className="lens-axis reveal" style={{ transitionDelay: "0.55s" }} />

            <div className="lens-stage reveal" style={{ transitionDelay: "0.3s" }}>
                <div className="lens-ring-outer" />

                {/* outer rotating ring text */}
                <svg className="ring-text" viewBox="0 0 400 400" aria-hidden="true">
                    <defs>
                        <path id="ringPathOuter" d="M200,200 m-178,0 a178,178 0 1,1 356,0 a178,178 0 1,1 -356,0" />
                    </defs>
                    <text>
                        <textPath href="#ringPathOuter" textLength="1117" lengthAdjust="spacingAndGlyphs">
                            VIDEO CALLS · SCREEN SHARE · LIVE CHAT · PEER TO PEER ·&nbsp;
                        </textPath>
                    </text>
                </svg>

                {/* inner counter-rotating ring text */}
                <svg className="ring-text reverse" viewBox="0 0 400 400" aria-hidden="true">
                    <defs>
                        <path id="ringPathInner" d="M200,200 m-144,0 a144,144 0 1,1 288,0 a144,144 0 1,1 -288,0" />
                    </defs>
                    <text>
                        <textPath href="#ringPathInner" textLength="903" lengthAdjust="spacingAndGlyphs">
                            NEXUS · WEBRTC · ENCRYPTED · NO DOWNLOADS · NEXUS · WEBRTC ·&nbsp;
                        </textPath>
                    </text>
                </svg>

                {/* the lens itself */}
                <div className="lens-body">
                    <div className="lens-core">
                        <div className="live-tag">On Air</div>
                        <div className="eq">
                            <span /><span /><span /><span /><span />
                        </div>
                        <div className="lens-caption">CALL IN PROGRESS</div>
                    </div>
                </div>
            </div>

            {/* ── Headline — bottom left ── */}
            <div className="hero-title-block reveal" style={{ transitionDelay: "0.45s" }}>
                <h1 className="hero-h1">
                    The operating<br />
                    system for human<br />
                    connection.
                </h1>
                <div className="hero-cta-row">
                    <button className="hero-cta" onClick={() => router("/auth")}>
                        <span>Start a call</span>
                        <span className="hero-cta-circle">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M4 12h15M13 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
                            </svg>
                        </span>
                    </button>
                </div>
            </div>

            {/* ── Bottom right micro footer ── */}
            <div className="hero-foot reveal" style={{ transitionDelay: "0.6s" }}>
                P2P · WEBRTC · NO DOWNLOADS<br />
                © 2026 NEXUS
            </div>
        </div>
    )
}
