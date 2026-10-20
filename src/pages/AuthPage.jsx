import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../services/apiConfig.js';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/pages.css';
import '../styles/AuthPage.css';

const EMPTY_SIGNUP = {
  username: '',
  email: '',
  password: '',
  displayName: '',
};

export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const { user, loading, error: sessionError, clearError, signup, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_SIGNUP);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const returnPath = location.state?.from?.pathname;
    navigate(returnPath || '/', { replace: true });
  }, [user, location.state, navigate]);

  useEffect(() => {
    setFormError('');
    setFieldErrors({});
    setSuccess('');
    clearError();
  }, [mode, clearError]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: '' }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    setFieldErrors({});
    setSuccess('');
    clearError();
    setSubmitting(true);

    try {
      if (isSignup) {
        await signup({
          ...form,
          bio: null,
          avatarUrl: null,
        });
        setSuccess('Your account has been created. Sign in to continue.');
        setForm(EMPTY_SIGNUP);
      } else {
        await login({
          identifier: form.identifier,
          password: form.password,
        });
      }
    } catch (requestError) {
      setFormError(requestError.message);
      setFieldErrors(requestError.data?.fields ?? {});
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="page-wrap auth-page" aria-busy="true">Checking your session…</div>;
  }

  return (
    <section className="page-wrap auth-page" aria-labelledby="auth-title">
      <div className="auth-card">
        <p className="eyebrow">Origin · Creativity</p>
        <h1 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-card__intro">
          {isSignup
            ? 'Join the community and share the work that inspires you.'
            : 'Sign in to continue to your creative community.'}
        </p>

        {!API_BASE_URL && (
          <p className="notice notice--error" role="alert">
            Authentication is not configured. Set VITE_API_BASE_URL to your backend URL and restart Vite.
          </p>
        )}
        {sessionError && <p className="notice notice--error" role="alert">{sessionError}</p>}
        {success && <p className="notice" role="status">{success}</p>}
        {formError && <p className="notice notice--error" role="alert">{formError}</p>}

        <form onSubmit={handleSubmit}>
          {isSignup ? (
            <>
              <div className="field">
                <label htmlFor="auth-display-name">Display name</label>
                <input
                  id="auth-display-name"
                  name="displayName"
                  autoComplete="name"
                  maxLength={80}
                  required
                  value={form.displayName}
                  onChange={updateField}
                  aria-invalid={Boolean(fieldErrors.displayName)}
                  aria-describedby={fieldErrors.displayName ? 'auth-display-name-error' : undefined}
                />
                {fieldErrors.displayName && <p className="field__error" id="auth-display-name-error">{fieldErrors.displayName}</p>}
              </div>
              <div className="field">
                <label htmlFor="auth-username">Username</label>
                <input
                  id="auth-username"
                  name="username"
                  autoComplete="username"
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9_]{3,30}"
                  required
                  value={form.username}
                  onChange={updateField}
                  aria-invalid={Boolean(fieldErrors.username)}
                  aria-describedby={fieldErrors.username ? 'auth-username-error' : undefined}
                />
                {fieldErrors.username && <p className="field__error" id="auth-username-error">{fieldErrors.username}</p>}
              </div>
              <div className="field">
                <label htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={form.email}
                  onChange={updateField}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
                />
                {fieldErrors.email && <p className="field__error" id="auth-email-error">{fieldErrors.email}</p>}
              </div>
              <div className="field">
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={form.password}
                  onChange={updateField}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'auth-password-error' : 'auth-password-hint'}
                />
                <p className="field__hint" id="auth-password-hint">Use 12 to 128 characters.</p>
                {fieldErrors.password && <p className="field__error" id="auth-password-error">{fieldErrors.password}</p>}
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="auth-identifier">Username or email</label>
                <input
                  id="auth-identifier"
                  name="identifier"
                  autoComplete="username"
                  required
                  value={form.identifier ?? ''}
                  onChange={updateField}
                />
              </div>
              <div className="field">
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={updateField}
                />
              </div>
            </>
          )}

          <button className="solid-btn auth-card__submit" type="submit" disabled={submitting || !API_BASE_URL}>
            {submitting ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="auth-card__switch">
          {isSignup ? 'Already have an account?' : 'New to Origin?'}{' '}
          <Link to={isSignup ? '/login' : '/signup'}>
            {isSignup ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </div>
    </section>
  );
}
