import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { AuthBrand } from '../components/AuthBrand';
import { API_BASE_URL } from '../services/api';
import './Auth.css';

interface LoginProps {
  onAuthed: (accessToken: string) => void;
  onSwitchToSignup: () => void;
}

export function Login({ onAuthed, onSwitchToSignup }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      // Direct fetch (not the shared client) so a 401 shows an inline error instead of triggering
      // the refresh/redirect flow. credentials:'include' captures the refresh cookie.
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (res.ok) {
        const data = await res.json();
        onAuthed(data.accessToken);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Invalid email or password.');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <AuthBrand />
      <div className="auth-panel">
        <div className="auth-card">
          <h2 className="auth-card__title">Welcome back</h2>
          <p className="auth-card__subtitle">Sign in to your workspace</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="auth-error">{error}</div>}
            <div className="auth-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={error ? 'has-error' : ''}
                placeholder="you@company.com"
              />
            </div>
            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <div className="auth-input-wrap">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={error ? 'has-error' : ''}
                  placeholder="••••••••"
                />
                <button type="button" className="toggle" onClick={() => setShowPw(!showPw)} aria-label="Toggle password">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={18} /> : 'Sign in'}
            </button>
          </form>

          <p className="auth-switch">
            Don&apos;t have an account? <button onClick={onSwitchToSignup}>Create one</button>
          </p>
        </div>
      </div>
    </div>
  );
}
