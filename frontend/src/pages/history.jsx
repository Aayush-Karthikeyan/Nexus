import React, { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { useNavigate, Link } from 'react-router-dom';
import "../App.css";

export default function History() {
    const { getHistoryOfUser } = useContext(AuthContext);
    const [meetings, setMeetings] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const history = await getHistoryOfUser();
                setMeetings(history);
            } catch {}
        }
        fetchHistory();
    }, [])  // eslint-disable-line react-hooks/exhaustive-deps

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    }

    return (
        <div style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--text)', fontFamily:'var(--font-body)' }}>

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
            <div style={{ maxWidth:640, margin:'0 auto', padding:'60px 24px' }}>
                <div className="fade-up" style={{ marginBottom:40 }}>
                    <h1 style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'2.6rem', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:10 }}>
                        Meeting History
                    </h1>
                    <p style={{ color:'var(--muted)', fontSize:10, fontFamily:'var(--font-mono)', letterSpacing:'0.25em', textTransform:'uppercase' }}>
                        Your recent Nexus calls
                    </p>
                </div>

                {meetings.length === 0 ? (
                    <div className="glass fade-up-2" style={{ padding:'48px 32px', textAlign:'center' }}>
                        <p style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.3em', color:'var(--faint)', textTransform:'uppercase', marginBottom:8 }}>
                            — NO DATA —
                        </p>
                        <p style={{ color:'var(--muted)', fontSize:'0.9rem' }}>No meetings yet. Start one!</p>
                        <button className="btn-glow" style={{ marginTop:24, padding:'12px 28px' }} onClick={() => navigate('/home')}>
                            Start a meeting →
                        </button>
                    </div>
                ) : (
                    <div className="fade-up-2" style={{ display:'flex', flexDirection:'column', gap:1, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.08)' }}>
                        {meetings.map((e, i) => (
                            <div key={i} style={{ padding:'22px 26px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', background:'var(--bg)', transition:'background 0.2s' }}
                                onMouseEnter={el => el.currentTarget.style.background='#181818'}
                                onMouseLeave={el => el.currentTarget.style.background='var(--bg)'}
                                onClick={() => navigate(`/${e.meetingCode}`)}
                            >
                                <div style={{ display:'flex', alignItems:'center', gap:20 }}>
                                    <span style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.15em', color:'var(--faint)' }}>
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <div>
                                        <p style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.85rem', letterSpacing:'0.08em', marginBottom:4, textTransform:'uppercase' }}>{e.meetingCode}</p>
                                        <p style={{ color:'var(--muted)', fontSize:'0.75rem', fontFamily:'var(--font-mono)' }}>{formatDate(e.date)}</p>
                                    </div>
                                </div>
                                <span style={{ fontSize:10, color:'var(--text)', fontFamily:'var(--font-mono)', letterSpacing:'0.2em', textTransform:'uppercase' }}>Rejoin →</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
