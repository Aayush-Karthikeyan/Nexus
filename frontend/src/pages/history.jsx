import React, { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { useNavigate, Link } from 'react-router-dom';
import withAuth from '../utils/withAuth';
import "../App.css";

function History() {
    const { getHistoryOfUser } = useContext(AuthContext);
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        let cancelled = false;

        const fetchHistory = async () => {
            try {
                const history = await getHistoryOfUser();
                if (cancelled) return;
                // The API should return an array; anything else (an error
                // object, null, a string) must not reach .map()
                setMeetings(Array.isArray(history) ? history : []);
            } catch (err) {
                if (cancelled) return;
                if (err?.response?.status === 401) {
                    // Token is missing, gone, or no longer valid — back to sign in
                    try { localStorage.removeItem("token"); } catch (e) { }
                    navigate("/auth", { replace: true });
                    return;
                }
                setError("Couldn't load your meeting history. Please try again.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchHistory();
        return () => { cancelled = true; };
    }, [])  // eslint-disable-line react-hooks/exhaustive-deps

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "—";
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    // Shared shell for the loading / error / empty states
    const StatusCard = ({ label, text, children }) => (
        <div className="glass fade-up-2" style={{ padding: '48px 32px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 8 }}>
                {label}
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{text}</p>
            {children}
        </div>
    );

    const renderBody = () => {
        if (loading) {
            return <StatusCard label="— LOADING —" text="Fetching your meetings…" />;
        }

        if (error) {
            return (
                <StatusCard label="— ERROR —" text={error}>
                    <button className="btn-glow" style={{ marginTop: 24, padding: '12px 28px' }} onClick={() => window.location.reload()}>
                        Try again →
                    </button>
                </StatusCard>
            );
        }

        if (meetings.length === 0) {
            return (
                <StatusCard label="— NO DATA —" text="No meetings yet. Start one!">
                    <button className="btn-glow" style={{ marginTop: 24, padding: '12px 28px' }} onClick={() => navigate('/home')}>
                        Start a meeting →
                    </button>
                </StatusCard>
            );
        }

        return (
            <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {meetings.map((e, i) => (
                    <div key={e._id || `${e.meetingCode}-${i}`} style={{ padding: '22px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg)', transition: 'background 0.2s' }}
                        onMouseEnter={el => el.currentTarget.style.background = '#181818'}
                        onMouseLeave={el => el.currentTarget.style.background = 'var(--bg)'}
                        onClick={() => navigate(`/${e.meetingCode}`)}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--faint)' }}>
                                {String(i + 1).padStart(2, '0')}
                            </span>
                            <div>
                                <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.08em', marginBottom: 4, textTransform: 'uppercase' }}>{e.meetingCode}</p>
                                <p style={{ color: 'var(--muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{formatDate(e.date)}</p>
                            </div>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text)', fontFamily: 'var(--font-mono)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Rejoin →</span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>

            {/* Navbar */}
            <nav className="home-nav">
                <Link to="/" className="wordmark">
                    NEXUS<span className="wm-dot" />APP
                </Link>
                <button className="nav-text-link" onClick={() => navigate('/home')}>
                    ← Back to Home
                </button>
            </nav>

            {/* Content */}
            <div style={{ maxWidth: 640, margin: '0 auto', padding: '60px 24px' }}>
                <div className="fade-up" style={{ marginBottom: 40 }}>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2.6rem', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                        Meeting History
                    </h1>
                    <p style={{ color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
                        Your recent Nexus calls
                    </p>
                </div>

                {renderBody()}
            </div>
        </div>
    )
}

export default withAuth(History)
