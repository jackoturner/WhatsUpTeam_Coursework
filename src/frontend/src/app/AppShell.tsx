import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import mascotImage from '../assets/whatsup-teams-mascot.png';
import Button from '../components/Button';
import Link from '../components/Link';
import { useAuth } from '../features/auth/AuthContext';
import type { Route, WorkspaceRouteName } from '../hooks/useRoute';
import { navigate } from '../hooks/useRoute';
import styles from './AppShell.module.css';

interface AppShellProps {
  route: Route;
  children: ReactNode;
}

const ROUTE_TITLES: Record<Route['name'], string> = {
  chats: 'Messages',
  files: 'File library',
  contacts: 'Contacts',
  groups: 'Groups',
  settings: 'Account settings',
  reporting: 'Report a message',
  audit: 'Security audit',
  admin_users: 'User management',
  admin_roles: 'Roles and permissions',
  admin_organisation: 'Organisation settings',
  login: 'Sign in',
  not_found: 'Page not found',
  forbidden: 'Access denied',
};

interface NavigationItem {
  label: string;
  route: WorkspaceRouteName;
  to: string;
  icon: WorkspaceRouteName;
}

const MAIN_NAVIGATION: readonly NavigationItem[] = [
  { label: 'Messages', route: 'chats', to: '/chats', icon: 'chats' },
  { label: 'Files', route: 'files', to: '/files', icon: 'files' },
  { label: 'Contacts', route: 'contacts', to: '/contacts', icon: 'contacts' },
  { label: 'Groups', route: 'groups', to: '/groups', icon: 'groups' },
  { label: 'Reporting', route: 'reporting', to: '/reporting', icon: 'reporting' },
];

const ADMIN_NAVIGATION: readonly NavigationItem[] = [
  { label: 'Users', route: 'admin_users', to: '/admin/users', icon: 'admin_users' },
  { label: 'Roles', route: 'admin_roles', to: '/admin/roles', icon: 'admin_roles' },
  { label: 'Organisation', route: 'admin_organisation', to: '/admin/organisation', icon: 'admin_organisation' },
  { label: 'Security audit', route: 'audit', to: '/admin/audit', icon: 'audit' },
];

const ICONS: Record<WorkspaceRouteName, ReactNode> = {
  chats: <><path d="M4 5h16v12H9l-5 3z" /><path d="M8 9h8M8 13h5" /></>,
  files: <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z" /><path d="M13 3v7h7M8 14h8M8 17h8" /></>,
  contacts: <><circle cx="10" cy="8" r="3" /><path d="M4 20v-1a6 6 0 0 1 12 0v1zM17 5a3 3 0 0 1 0 6M19 15a5 5 0 0 1 2 4v1" /></>,
  groups: <><circle cx="9" cy="8" r="2.5" /><circle cx="17" cy="9" r="2" /><path d="M3 19v-1a6 6 0 0 1 12 0v1zM16 15a5 5 0 0 1 5 5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8H16l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.7z" /></>,
  reporting: <><path d="M4 20h17" /><path d="M7 17v-5M12 17V7M17 17v-8" /></>,
  audit: <><path d="M8 4H5v17h14V4h-3" /><path d="M9 3h6v4H9zM8 12h8M8 16h8" /></>,
  admin_users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1zM17 8h4M19 6v4M17 16h4" /></>,
  admin_roles: <><path d="M12 3 20 7v5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V7z" /><path d="m9 12 2 2 4-4" /></>,
  admin_organisation: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h1M14 10h1M9 14h1M14 14h1M10 21v-3h4v3" /></>,
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
              strokeWidth="1.8"
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const user = state.status === 'authenticated' ? state.user : null;
  const isWorkspace = user !== null && route.name !== 'login' && route.name !== 'not_found';

  useEffect(() => {
    document.title = `${ROUTE_TITLES[route.name]} · What's Up Teams`;
    mainRef.current?.focus();
    setAccountMenuOpen(false);
  }, [route.name]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [accountMenuOpen]);

  if (!isWorkspace || user === null) {
    return (
      <div className={styles.publicShell}>
        <a className={styles.skip} href="#main">Skip to content</a>
        {route.name !== 'login' && (
          <header className={styles.publicHeader}>
            <Link to="/" className={styles.publicBrand}>What&apos;s Up Teams</Link>
            {route.name !== 'not_found' && <Link to="/login" className={styles.signIn}>Sign in</Link>}
          </header>
        )}
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className={route.name === 'login' ? styles.loginMain : styles.publicMain}
        >
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
  const isAdmin = user.role === 'org_admin';
  const roleLabel = isAdmin ? 'IT Administrator' : user.role === 'group_manager' ? 'Group Manager' : 'Employee';

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchText.trim();
    navigate(query === '' ? '/chats' : `/chats?search=${encodeURIComponent(query)}`);
  }

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">Skip to content</a>
      <header className={styles.topbar}>
        <Link to="/chats" className={styles.brand} aria-label="What's Up Teams home">
          <span className={styles.brandMark} aria-hidden="true">
            <img src={mascotImage} alt="" />
          </span>
          <span className={styles.brandText}>What&apos;s Up Teams</span>
        </Link>
        <div className={styles.tenant} title={user.organisation.name}>
          <span className={styles.tenantMark} aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none">
              <path d="M10 2 17 5v4c0 4-2.8 7-7 9-4.2-2-7-5-7-9V5z" stroke="currentColor" strokeWidth="1.8" />
              <path d="m7 10 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={styles.tenantName}>{user.organisation.name}</span>
        </div>
        <form className={styles.globalSearch} role="search" onSubmit={submitSearch}>
          <label className="visually-hidden" htmlFor="workspace-search">Search conversations</label>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.8" />
            <path d="m16 16 5 5" />
          </svg>
          <input
            id="workspace-search"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search conversations"
          />
        </form>
        <div className={styles.account}>
          <button
            type="button"
            className={styles.accountButton}
            aria-expanded={accountMenuOpen}
            aria-haspopup="menu"
            onClick={() => setAccountMenuOpen((open) => !open)}
          >
            {user.avatar_url ? (
              <img className={styles.avatarImage} src={user.avatar_url} alt="" />
            ) : (
              <span className={styles.avatar}>{initials || 'U'}</span>
            )}
            <span className={styles.accountName}>{user.display_name}</span>
            <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </button>
          {accountMenuOpen && (
            <div className={styles.accountMenu} role="menu">
              <p className={styles.accountMenuIdentity}>{user.display_name}<span>{roleLabel}</span></p>
              <Link to="/account" role="menuitem" className={styles.accountMenuLink}>Account settings</Link>
              <Button
                role="menuitem"
                variant="ghost"
                className={styles.menuSignOut}
                onClick={() => void logout()}
              >
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>

      <aside className={styles.sidebar}>
        <nav className={styles.navigation} aria-label="Primary navigation">
          <NavigationLinks items={MAIN_NAVIGATION} route={route} />
          {isAdmin && (
            <>
              <p className={styles.navSectionLabel}>Administration</p>
              <NavigationLinks items={ADMIN_NAVIGATION} route={route} />
            </>
          )}
        </nav>
        <Link
          to="/account"
          className={styles.navLink}
          aria-current={route.name === 'settings' ? 'page' : undefined}
        >
          <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            {ICONS.settings}
          </svg>
          <span>Account</span>
        </Link>
        <div className={styles.securityNote}>
          <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path d="M14 2 24 6v7c0 6-4 10-10 13C8 23 4 19 4 13V6z" stroke="currentColor" strokeWidth="2" />
            <rect x="10" y="12" width="8" height="7" rx="1" fill="currentColor" />
            <path d="M12 12v-2a2 2 0 0 1 4 0v2" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span>Secure corporate<br />messaging</span>
        </div>
      </aside>

      <div className={styles.workspace}>
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className={route.name === 'chats' ? `${styles.main} ${styles.chatMain}` : styles.main}
        >
          <section className={styles.pagePanel} aria-label={`${ROUTE_TITLES[route.name]} content`}>
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}
