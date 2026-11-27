// Minimal history-based router: no new dependency, nginx already serves index.html
// for every unknown path (try_files ... /index.html).
import { useSyncExternalStore } from 'react';

export type WorkspaceRouteName =
  | 'chats'
  | 'files'
  | 'contacts'
  | 'groups'
  | 'settings'
  | 'reporting'
  | 'audit'
  | 'admin_users'
  | 'admin_roles'
  | 'admin_organisation';

export type Route =
  | { name: 'chats'; conversationId?: string }
  | { name: Exclude<WorkspaceRouteName, 'chats'> }
  | { name: 'login' | 'not_found' | 'forbidden' };

const STATIC_ROUTES: Record<string, Route> = {
  '/': { name: 'chats' },
  '/chats': { name: 'chats' },
  '/chat': { name: 'chats' },
  '/login': { name: 'login' },
  '/files': { name: 'files' },
  '/contacts': { name: 'contacts' },
  '/groups': { name: 'groups' },
  '/settings': { name: 'settings' },
  '/account': { name: 'settings' },
  '/reporting': { name: 'reporting' },
  '/audit': { name: 'audit' },
  '/admin/audit': { name: 'audit' },
  '/admin/users': { name: 'admin_users' },
  '/admin/roles': { name: 'admin_roles' },
  '/admin/organisation': { name: 'admin_organisation' },
  '/403': { name: 'forbidden' },
  '/404': { name: 'not_found' },
};

export function parsePath(pathname: string): Route {
  const staticRoute = STATIC_ROUTES[pathname];
  if (staticRoute !== undefined) {
    return staticRoute;
  }
  const conversation = /^\/chat\/([1-9]\d{0,8})$/.exec(pathname);
  if (conversation !== null) {
    return { name: 'chats', conversationId: conversation[1] };
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
