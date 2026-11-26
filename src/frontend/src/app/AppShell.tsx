import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Button from '../components/Button';
import Link from '../components/Link';
import { useAuth } from '../features/auth/AuthContext';
import type { Route, WorkspaceRouteName } from '../hooks/useRoute';
import styles from './AppShell.module.css';

interface AppShellProps {
  route: Route;
  children: ReactNode;
}

const ROUTE_TITLES: Record<Route['name'], string> = {
  chats: 'Chats',
  contacts: 'Contacts',
  groups: 'Groups',
  settings: 'Settings',
  reporting: 'Reporting',
  audit: 'Audit',
  login: 'Sign in',
  not_found: 'Page not found',
};

type IconName = WorkspaceRouteName;

interface NavigationItem {
  label: string;
  route: WorkspaceRouteName;
  to: string;
  icon: IconName;
}

const MAIN_NAVIGATION: readonly NavigationItem[] = [
  { label: 'Chats', route: 'chats', to: '/chats', icon: 'chats' },
  { label: 'Contacts', route: 'contacts', to: '/contacts', icon: 'contacts' },
  { label: 'Groups', route: 'groups', to: '/groups', icon: 'groups' },
  { label: 'Reporting', route: 'reporting', to: '/reporting', icon: 'reporting' },
  { label: 'Audit', route: 'audit', to: '/audit', icon: 'audit' },
];

const FOOTER_NAVIGATION: readonly NavigationItem[] = [
  { label: 'Settings', route: 'settings', to: '/settings', icon: 'settings' },
];

const ICONS: Record<IconName, ReactNode> = {
  chats: (
    <>
      <path d="M4 5h16v12H9l-5 3z" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  contacts: (
    <>
      <circle cx="10" cy="8" r="3" />
      <path d="M4 20v-1a6 6 0 0 1 12 0v1zM17 5a3 3 0 0 1 0 6M19 15a5 5 0 0 1 2 4v1" />
    </>
  ),
  groups: (
    <>
      <circle cx="9" cy="8" r="2.5" />
      <circle cx="17" cy="9" r="2" />
      <path d="M3 19v-1a6 6 0 0 1 12 0v1zM16 15a5 5 0 0 1 5 5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8H16l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.7z" />
    </>
  ),
  reporting: (
    <>
      <path d="M4 20h17" />
      <path d="M7 17v-5M12 17V7M17 17v-8" />
    </>
  ),
  audit: (
    <>
      <path d="M8 4H5v17h14V4h-3" />
      <path d="M9 3h6v4H9zM8 12h8M8 16h8" />
    </>
  ),
};

function NavigationLinks({ items, route }: { items: readonly NavigationItem[]; route: Route }) {
  return (
    <ul className={styles.navList}>
      {items.map((item) => (
        <li key={item.route}>
          <Link
            to={item.to}
            className={styles.navLink}
            aria-current={route.name === item.route ? 'page' : undefined}
          >
            <svg
              className={styles.navIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {ICONS[item.icon]}
            </svg>
            <span>{item.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function AppShell({ route, children }: AppShellProps) {
  const { state, logout } = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  const user = state.status === 'authenticated' ? state.user : null;
  const isWorkspace = user !== null && route.name !== 'login';

  useEffect(() => {
    document.title = `${ROUTE_TITLES[route.name]} · WhatsUpTeam`;
    mainRef.current?.focus();
  }, [route.name]);

  if (!isWorkspace) {
    return (
      <div className={styles.publicShell}>
        <a className={styles.skip} href="#main">
          Skip to content
        </a>
        <header className={styles.publicHeader}>
          <Link to="/" className={styles.publicBrand}>
            What&apos;s Up Teams
          </Link>
          {route.name !== 'login' && (
            <Link to="/login" className={styles.signIn}>
              Sign in
            </Link>
          )}
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className={styles.publicMain}>
          {children}
        </main>
      </div>
    );
  }

  const initials = user.display_name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const visibleNavigation =
    user.role === 'org_admin'
      ? MAIN_NAVIGATION
      : MAIN_NAVIGATION.filter((item) => item.route !== 'audit');
  const roleLabel = user.role === 'org_admin' ? 'IT Admin' : user.role.replace('_', ' ');

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <aside className={styles.sidebar}>
        <Link to="/chats" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <svg className={styles.brandMascot} viewBox="0 0 48 48" fill="none">
              <path
                d="M24 4 40 10v12c0 10-6.2 17.1-16 22C14.2 39.1 8 32 8 22V10z"
                fill="#48256f"
                stroke="#bd96ff"
                strokeWidth="1.5"
              />
              <circle cx="18.5" cy="21" r="2" fill="#f3efff" />
              <circle cx="29.5" cy="21" r="2" fill="#f3efff" />
              <path d="M18 28c1.5 3 3.5 4.5 6 4.5s4.5-1.5 6-4.5" stroke="#f3efff" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span className={styles.brandText}>
            What&apos;s Up Teams
            <span className={styles.brandCaption}>SECURE WORKSPACE</span>
          </span>
        </Link>
        <nav className={styles.navigation} aria-label="Primary navigation">
          <NavigationLinks items={visibleNavigation} route={route} />
          <NavigationLinks items={FOOTER_NAVIGATION} route={route} />
        </nav>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>WORKSPACE</p>
            <h1 className={styles.pageTitle}>{ROUTE_TITLES[route.name]}</h1>
          </div>
          <div className={styles.user}>
            <span className={styles.avatar} aria-hidden="true">{initials || 'U'}</span>
            <span className={styles.userDetails}>
              <span className={styles.userName} data-testid="current-user">
                {user.display_name}
              </span>
              <span className={styles.userRole}>{roleLabel}</span>
            </span>
            <Button className={styles.signOut} variant="ghost" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
          <section className={styles.pagePanel} aria-label={`${ROUTE_TITLES[route.name]} content`}>
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}
