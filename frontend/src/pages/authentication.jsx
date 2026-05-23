import * as React from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import "../App.css";

export default function Authentication() {
    const [username, setUsername] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [name, setName]         = React.useState('');
    const [error, setError]       = React.useState('');
    const [success, setSuccess]   = React.useState('');
    const [formState, setFormState] = React.useState(0); // 0=signin, 1=signup

    const { handleRegister, handleLogin } = React.useContext(AuthContext);

    const handleAuth = async () => {
        setError('');
        try {
            if (formState === 0) {
                await handleLogin(username, password);
            } else {
                const result = await handleRegister(name, username, password);
                setSuccess(result || 'Account created! Please sign in.');
                setUsername(''); setPassword(''); setName('');
                setFormState(0);
            }
        } catch (err) {
            setError(err?.response?.data?.message || 'Something went wrong.');
        }
    };

    const handleKey = (e) => { if (e.key === 'Enter') handleAuth(); };

    return (
        <div className="auth-page">
            {/* Left brand panel */}
            <div className="auth-left">
                <div className="orb orb-purple" style={{ width: 500, height: 500, top: '-80px', left: '-80px' }} />
                <div className="orb orb-blue"   style={{ width: 400, height: 400, bottom: '-60px', right: '-60px' }} />
                <div className="orb orb-pink"   style={{ width: 250, height: 250, top: '45%', left: '50%' }} />

                <div className="auth-left-content fade-up">
                    <Link to="/" className="auth-logo">
                        <div className="logo-icon">⚡</div>
                        Nexus
                    </Link>
                    <h2 className="auth-tagline">
                        <span className="grad-text">Connect.</span><br />
                        Collaborate.<br />
                        Create.
                    </h2>
                    <p className="auth-tagline-sub">
                        Join thousands of teams using Nexus for crystal-clear video meetings, every day.
                    </p>
                </div>
            </div>

            {/* Right form panel */}
            <div className="auth-right">
                <div className="auth-form-wrap fade-up">
                    <h2>{formState === 0 ? 'Welcome back' : 'Create account'}</h2>
                    <p className="auth-sub">
                        {formState === 0
                            ? 'Sign in to your Nexus account.'
                            : 'Start for free. No credit card required.'}
                    </p>

                    {/* Tabs */}
                    <div className="tab-row">
                        <button className={`tab-btn ${formState === 0 ? 'active' : ''}`} onClick={() => { setFormState(0); setError(''); }}>Sign In</button>
                        <button className={`tab-btn ${formState === 1 ? 'active' : ''}`} onClick={() => { setFormState(1); setError(''); }}>Sign Up</button>
                    </div>

                    {formState === 1 && (
                        <div className="form-group">
                            <label>Full Name</label>
                            <input
                                className="auth-input"
                                placeholder="Your name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                onKeyDown={handleKey}
                                autoFocus
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>Username</label>
                        <input
                            className="auth-input"
                            placeholder="Enter username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            onKeyDown={handleKey}
                            autoFocus={formState === 0}
                        />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            className="auth-input"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyDown={handleKey}
                        />
                    </div>

                    {error   && <div className="auth-error">⚠️ {error}</div>}
                    {success && <div className="auth-error" style={{ color: '#4ade80', borderColor: 'rgba(74,222,128,0.2)', background: 'rgba(74,222,128,0.06)' }}>✅ {success}</div>}

                    <button className="auth-submit" onClick={handleAuth}>
                        {formState === 0 ? 'Sign in →' : 'Create account →'}
                    </button>
                </div>
            </div>
        </div>
    );
}