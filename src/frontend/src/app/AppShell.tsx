import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Link from '../components/Link';
import { useAuth } from '../features/auth/AuthContext';
import { useApi } from '../hooks/useApi';
import type { Route } from '../hooks/useRoute';
import styles from './AppShell.module.css';

interface AppShellProps {
  route: Route;
  children: ReactNode;
}

const ROUTE_TITLES: Record<Route['name'], string> = {
  home: 'Home',
  login: 'Sign in',
  not_found: 'Page not found',
};

/** Page frame: header with the signed-in user. Hiding a control is UX only — the API decides. */
export default function AppShell({ route, children }: AppShellProps) {
  const api = useApi();
  const { state, logout } = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  const user = state.status === 'authenticated' ? state.user : null;

  useEffect(() => {
    document.title = `${ROUTE_TITLES[route.name]} · WhatsUpTeam`;
    mainRef.current?.focus();
  }, [route.name]);

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          WhatsUpTeam
        </Link>
        {api.mode === 'mock' && <Badge tone="brand">Mock mode</Badge>}
        {user && (
          <div className={styles.user}>
            <span className={styles.userName} data-testid="current-user">
              {user.display_name}
            </span>
            <Button variant="ghost" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        )}
        {!user && route.name !== 'login' && (
          <Link to="/login" className={styles.signIn}>
            Sign in
          </Link>
        )}
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
        {children}
      </main>
    </div>
  );
}
