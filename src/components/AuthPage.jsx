import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ShieldCheck, User, Lock, LogIn, UserPlus, Sparkles, AlertCircle } from 'lucide-react';

export const AuthPage = ({ onAuthSuccess }) => {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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
        const { data, error: rpcError } = await supabase.rpc('register_poker_user', {
          p_username: cleanUsername,
          p_password: password
        });

        if (rpcError) {
          setError(rpcError.message);
          setLoading(false);
          return;
        }

        if (data && data.success) {
          localStorage.setItem('pokermaster_user', JSON.stringify(data.user));
          onAuthSuccess(data.user);
        } else {
          setError('Registration failed. Please try again.');
        }
      } else {
        const { data, error: rpcError } = await supabase.rpc('login_poker_user', {
          p_username: cleanUsername,
          p_password: password
        });

        if (rpcError) {
          setError(rpcError.message);
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
      // Fallback for offline or local preview mode
      console.warn('Supabase auth RPC fallback:', err);
      const guestUser = {
        id: 'guest_' + Math.random().toString(36).substring(2, 9),
        username: cleanUsername,
        chips: 5000,
        isGuest: true
      };
      localStorage.setItem('pokermaster_user', JSON.stringify(guestUser));
      onAuthSuccess(guestUser);
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
              <span className="auth-field-hint">Your unique identity at the poker tables</span>
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
