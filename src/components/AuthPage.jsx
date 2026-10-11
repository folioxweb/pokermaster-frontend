import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ShieldCheck, User, Lock, LogIn, UserPlus, Sparkles, AlertCircle, CheckCircle2, Loader2, Sun, Moon } from 'lucide-react';

export const AuthPage = ({ onAuthSuccess, theme = 'dark', onToggleTheme = null }) => {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'taken'

  // Real-time username check on register tab
  React.useEffect(() => {
    if (tab !== 'register') {
      setUsernameStatus('idle');
      return;
    }

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { data, error: queryErr } = await supabase
          .from('poker_users')
          .select('id, username')
          .ilike('username', cleanUsername)
          .maybeSingle();

        if (!queryErr && data) {
          setUsernameStatus('taken');
        } else {
          setUsernameStatus('available');
        }
      } catch (e) {
        setUsernameStatus('idle');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [username, tab]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError('Please enter a username.');
      return;
    }
    if (cleanUsername.length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }
    if (!password || password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    if (tab === 'register' && password !== confirmPassword) {
      setError('Passwords do not match. Please retype password.');
      return;
    }

    setLoading(true);

    try {
      if (tab === 'register') {
        // 1. Direct pre-check for existing username in poker_users
        const { data: existingUser } = await supabase
          .from('poker_users')
          .select('id, username')
          .ilike('username', cleanUsername)
          .maybeSingle();

        if (existingUser) {
          setError(`Username "${cleanUsername}" already exists. Please choose a different username or switch to Sign In.`);
          setUsernameStatus('taken');
          setLoading(false);
          return;
        }

        // 2. Call register RPC
        const { data, error: rpcError } = await supabase.rpc('register_poker_user', {
          p_username: cleanUsername,
          p_password: password
        });

        if (rpcError) {
          const msg = rpcError.message || '';
          if (
            msg.toLowerCase().includes('already taken') ||
            msg.toLowerCase().includes('already exist') ||
            rpcError.code === 'P0001' ||
            rpcError.code === '23505'
          ) {
            setError(`Username "${cleanUsername}" already exists. Please choose a different username or switch to Sign In.`);
            setUsernameStatus('taken');
          } else {
            setError(msg || 'Registration failed. Please try again.');
          }
          setLoading(false);
          return;
        }

        if (data && data.success) {
          localStorage.setItem('pokermaster_user', JSON.stringify(data.user));
          onAuthSuccess(data.user);
        } else {
          setError(data?.message || 'Registration failed. Please try again.');
        }
      } else {
        const { data, error: rpcError } = await supabase.rpc('login_poker_user', {
          p_username: cleanUsername,
          p_password: password
        });

        if (rpcError) {
          setError(rpcError.message || 'Login failed. Please verify credentials.');
          setLoading(false);
          return;
        }

        if (data && data.success) {
          localStorage.setItem('pokermaster_user', JSON.stringify(data.user));
          onAuthSuccess(data.user);
        } else {
          setError('Login failed. Please verify credentials.');
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      // Explicit error presentation - never silently convert registration to guest!
      if (tab === 'register') {
        setError(err.message || 'Registration failed. Please choose another username.');
      } else {
        setError(err.message || 'Login failed. Please verify credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = () => {
    const randomGuestNum = Math.floor(1000 + Math.random() * 9000);
    const guestUser = {
      id: 'guest_' + randomGuestNum,
      username: `Guest_${randomGuestNum}`,
      chips: 5000,
      isGuest: true
    };
    localStorage.setItem('pokermaster_user', JSON.stringify(guestUser));
    onAuthSuccess(guestUser);
  };

  return (
    <div className="auth-container">
      {onToggleTheme && (
        <button
          type="button"
          onClick={() => onToggleTheme()}
          className="auth-theme-toggle"
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
          {theme === 'light' ? <Moon className="w-4 h-4 text-slate-700" /> : <Sun className="w-4 h-4 text-amber-400" />}
        </button>
      )}

      {/* Background Ambience */}
      <div className="auth-ambient-glow auth-glow-amber" />
      <div className="auth-ambient-glow auth-glow-emerald" />

      {/* Main Auth Card */}
      <div className="auth-card">
        {/* Brand Header */}
        <div className="auth-header">
          <div className="auth-badge">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>High Stakes Texas Hold'em</span>
          </div>
          <h1 className="auth-title">POKERMASTER</h1>
          <p className="auth-subtitle">
            Server-Authoritative Ring Game • 3 to 8 Players
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tab-bar">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(null); }}
            className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(null); }}
            className={`auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Register</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="auth-error-box">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">Username (Unique handle)</label>
            <div className="auth-input-wrapper">
              <User className="auth-input-icon" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose unique username"
                maxLength={20}
                required
                className="auth-input"
              />
            </div>
            {tab === 'register' && (
              <div style={{ marginTop: '6px' }}>
                {usernameStatus === 'checking' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Checking availability...</span>
                  </span>
                )}
                {usernameStatus === 'taken' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#f87171', fontWeight: 700 }}>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>Username "{username.trim()}" already exists! Please choose another.</span>
                  </span>
                )}
                {usernameStatus === 'available' && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#34d399', fontWeight: 700 }}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Username is available!</span>
                  </span>
                )}
                {usernameStatus === 'idle' && (
                  <span className="auth-field-hint">Your unique identity at the poker tables</span>
                )}
              </div>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className="auth-input-wrapper">
              <Lock className="auth-input-icon" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="auth-input"
              />
            </div>
          </div>

          {tab === 'register' && (
            <div className="auth-field">
              <label className="auth-label">Confirm Password</label>
              <div className="auth-input-wrapper">
                <Lock className="auth-input-icon" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="auth-input"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="auth-submit-btn"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : tab === 'register' ? (
              <span>CREATE ACCOUNT (5,000 PTS)</span>
            ) : (
              <span>ENTER POKER LOBBY</span>
            )}
          </button>
        </form>

        {/* Guest Access Divider */}
        <div className="auth-divider">
          <span>OR</span>
        </div>

        <button
          type="button"
          onClick={handleGuestLogin}
          className="auth-guest-btn"
        >
          <span>Play Instantly as Guest</span>
        </button>

        {/* Security Footer Note */}
        <div className="auth-footer-note">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>RLS Cryptographic Hole-Card Protection</span>
        </div>
      </div>
    </div>
  );
};
