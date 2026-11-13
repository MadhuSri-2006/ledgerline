import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login as apiLogin } from '../services/api';
import { Alert, Spinner, EyeIcon, EyeOffIcon } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const data = await apiLogin(email, password);
      signIn(data.user);
      
      // Navigate to appropriate role destination
      if (data.user.role === 'ADMIN') {
        navigate('/admin');
      } else if (data.user.role === 'AUDITOR') {
        navigate('/auditor');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const setDemoCredentials = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '24px',
      background: 'radial-gradient(ellipse at top, #f1f5f9 0%, #e2e8f0 100%)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        backgroundColor: '#ffffff',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--gray-200)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden'
      }}>
        {/* Header Banner */}
        <div style={{
          padding: '32px 32px 24px',
          textAlign: 'center',
          borderBottom: '1px solid var(--gray-100)'
        }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '26px',
            fontWeight: 'bold',
            margin: '0 auto 16px',
            boxShadow: '0 4px 10px rgba(30, 64, 175, 0.3)'
          }}>
            L
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--gray-900)', letterSpacing: '-0.02em' }}>
            LedgerLine
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--gray-500)', marginTop: '4px' }}>
            Secure & Reliable Digital Banking
          </p>
        </div>

        {/* Login Form */}
        <div style={{ padding: '28px 32px' }}>
          {error && (
            <div style={{ marginBottom: '20px' }}>
              <Alert type="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">
                Email Address <span className="required">*</span>
              </label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="user@ledgerline.internal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label" htmlFor="login-password">
                Password <span className="required">*</span>
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: '42px', width: '100%' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: showPassword ? 'var(--primary)' : 'var(--gray-400)',
                    borderRadius: '4px',
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
              style={{ fontWeight: '600', letterSpacing: '0.01em' }}
            >
              {loading ? (
                <>
                  <Spinner />
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>Sign In to Account</span>
              )}
            </button>

            <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px', color: 'var(--gray-600)' }}>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/register')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--primary)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  font: 'inherit',
                }}
              >
                Register here
              </button>
            </div>
          </form>

          {/* Quick Demo Switcher */}
          <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--gray-100)' }}>
            <p style={{
              fontSize: '12px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--gray-500)',
              textAlign: 'center',
              marginBottom: '12px'
            }}>
              Quick Demo Access
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDemoCredentials('alice@ledgerline.internal', 'AlicePassword123!')}
              >
                👤 Alice (Holder)
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDemoCredentials('bob@ledgerline.internal', 'BobPassword123!')}
              >
                👤 Bob (Holder)
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDemoCredentials('admin@ledgerline.internal', 'AdminPassword123!')}
              >
                👑 Admin
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDemoCredentials('auditor@ledgerline.internal', 'AuditorPassword123!')}
              >
                🔍 Auditor
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div style={{
          padding: '14px 32px',
          backgroundColor: 'var(--gray-50)',
          borderTop: '1px solid var(--gray-100)',
          fontSize: '12px',
          color: 'var(--gray-500)',
          textAlign: 'center'
        }}>
          Your money. Your control. Your security.
        </div>
      </div>
    </div>
  );
}
