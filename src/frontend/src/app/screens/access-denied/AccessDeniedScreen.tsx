import Link from '../../../components/Link';
import { useAuth } from '../../../features/auth/AuthContext';
import styles from './AccessDeniedScreen.module.css';

export default function AccessDeniedScreen() {
  const { state } = useAuth();
  const signedIn = state.status === 'authenticated';

  return (
    <section className={styles.page} aria-labelledby="access-denied-title">
      <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M24 4 41 11v12c0 11-7 18-17 22C14 41 7 34 7 23V11z" />
          <rect x="17" y="21" width="14" height="12" rx="2" />
          <path d="M20 21v-4a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <p className={styles.code}>403 · ACCESS DENIED</p>
      <h1 id="access-denied-title">You don&apos;t have access to this page</h1>
      <p className={styles.description}>
        Your account does not have permission to view this area. If you believe this is incorrect, contact your organisation administrator.
      </p>
      <Link to={signedIn ? '/chats' : '/login'} className={styles.returnLink}>
        {signedIn ? 'Return to messages' : 'Sign in'}
      </Link>
    </section>
  );
}
