import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { AuthBrand } from '../components/AuthBrand';
import { API_BASE_URL } from '../services/api';
import './Auth.css';

interface SignupProps {
  onAuthed: (accessToken: string) => void;
  onSwitchToLogin: () => void;
}

export function Signup({ onAuthed, onSwitchToLogin }: SignupProps) {
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your email and a password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
          businessName: businessName.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onAuthed(data.accessToken);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Could not create your account.');
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
          <h2 className="auth-card__title">Create your account</h2>
          <p className="auth-card__subtitle">Start your WhatsApp business workspace</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="auth-error">{error}</div>}
            <div className="auth-field">
              <label htmlFor="name">Your name</label>
              <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="auth-field">
              <label htmlFor="businessName">Business name</label>
              <input
                id="businessName"
                type="text"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="Acme Inc."
              />
            </div>
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
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={error ? 'has-error' : ''}
                  placeholder="At least 8 characters"
                />
                <button type="button" className="toggle" onClick={() => setShowPw(!showPw)} aria-label="Toggle password">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={18} /> : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <button onClick={onSwitchToLogin}>Sign in</button>
          </p>
        </div>
      </div>
    </div>
  );
}
