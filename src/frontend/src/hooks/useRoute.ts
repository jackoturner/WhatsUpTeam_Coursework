// Minimal history-based router: no new dependency, nginx already serves index.html
// for every unknown path (try_files ... /index.html).
import { useSyncExternalStore } from 'react';

export type WorkspaceRouteName =
  | 'chats'
  | 'contacts'
  | 'groups'
  | 'settings'
  | 'reporting'
  | 'audit';

export type Route = { name: WorkspaceRouteName } | { name: 'login' } | { name: 'not_found' };

const STATIC_ROUTES: Record<string, Route> = {
  '/': { name: 'chats' },
  '/chats': { name: 'chats' },
  '/login': { name: 'login' },
  '/contacts': { name: 'contacts' },
  '/groups': { name: 'groups' },
  '/settings': { name: 'settings' },
  '/reporting': { name: 'reporting' },
  '/audit': { name: 'audit' },
};

export function parsePath(pathname: string): Route {
  const staticRoute = STATIC_ROUTES[pathname];
  if (staticRoute !== undefined) {
    return staticRoute;
  }
  return { name: 'not_found' };
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

function getLocation(): string {
  return window.location.pathname + window.location.search;
}

/** Only internal paths are accepted, so a crafted link can never redirect off-site. */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (!path.startsWith('/') || path.startsWith('//')) {
    return;
  }
  if (options.replace === true) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
  }
  listeners.forEach((listener) => listener());
}

export function useLocation(): { route: Route; search: URLSearchParams } {
  const location = useSyncExternalStore(subscribe, getLocation);
  const url = new URL(location, window.location.origin);
  return { route: parsePath(url.pathname), search: url.searchParams };
}
