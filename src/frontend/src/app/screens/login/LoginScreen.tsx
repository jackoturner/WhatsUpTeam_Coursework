import { useState } from 'react';
import type { FormEvent } from 'react';
import mascotImage from '../../../assets/whatsup-teams-mascot.png';
import Button from '../../../components/Button';
import Notice from '../../../components/Notice';
import { useAuth } from '../../../features/auth/AuthContext';
import { navigate } from '../../../hooks/useRoute';
import { errorMessage } from '../../../services/apiError';
import styles from './LoginScreen.module.css';

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <img src={mascotImage} alt="" />
    </span>
  );
}

export default function LoginScreen({ search }: { search: URLSearchParams }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate('/chats', { replace: true });
    } catch (loginError) {
      setError(errorMessage(loginError));
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.loginLayout}>
      <section className={styles.branding} aria-label="What's Up Teams security">
        <span className={`${styles.pixel} ${styles.pixelTop}`} aria-hidden="true" />
        <span className={`${styles.pixel} ${styles.pixelBottom}`} aria-hidden="true" />
        <div className={styles.brandHeading}>
          <BrandMark />
          <div>
            <p className={styles.brandTitle}>What&apos;s Up Teams</p>
            <p className={styles.brandSubtitle}>Secure corporate messaging<br />for modern organisations</p>
          </div>
        </div>
        <div className={styles.shieldIllustration}>
          <img
            src={mascotImage}
            alt="What's Up Teams mascot holding a security shield"
          />
          <span className={styles.shieldPixel} aria-hidden="true" />
        </div>
        <ul className={styles.securityFeatures}>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3 20 7v5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V7z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span><strong>Protected conversations</strong><small>Access is limited to authorised members.</small></span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
            </svg>
            <span><strong>Protected sessions</strong><small>Sign-in and session controls protect your account.</small></span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h1M14 10h1M9 14h1M14 14h1M10 21v-3h4v3" />
            </svg>
            <span><strong>Built for organisations</strong><small>Role-based access keeps work in the right hands.</small></span>
          </li>
        </ul>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.loginCard}>
          <BrandMark />
          <h1>Sign in to What&apos;s Up Teams</h1>
          <p className={styles.formSubtitle}>Access your organisation&apos;s secure messaging platform.</p>
          {search.get('expired') === '1' && (
            <Notice tone="warning">Your session has ended. Please sign in again.</Notice>
          )}
          {search.get('password_changed') === '1' && (
            <Notice tone="success">Password changed. Sign in with your new password.</Notice>
          )}
          <form onSubmit={(event) => void submit(event)} aria-label="Sign in">
            {error !== null && <Notice tone="error">{error}</Notice>}
            <label className={styles.field} htmlFor="login-username">
              <span>Username</span>
              <span className={styles.inputWrap}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  maxLength={32}
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter your username"
                />
              </span>
            </label>
            <label className={styles.field} htmlFor="login-password">
              <span>Password</span>
              <span className={styles.inputWrap}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                <input
                  id="login-password"
                  name="password"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete="current-password"
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            <Button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <div className={styles.trustNote}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 3 20 7v5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V7z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span><strong>Protected sign-in</strong><small>Your organisation manages access to this workspace.</small></span>
          </div>
        </div>
      </section>
    </div>
  );
}
