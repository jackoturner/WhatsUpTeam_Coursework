import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';
import { ApiContext } from '../hooks/useApi';
import { navigate, useLocation } from '../hooks/useRoute';
import type { Route } from '../hooks/useRoute';
import type { WhatsUpApi } from '../types/api';
import AppShell from './AppShell';
import HomeScreen from './screens/home/HomeScreen';
import LoginScreen from './screens/login/LoginScreen';
import NotFoundScreen from './screens/notfound/NotFoundScreen';

// Every route missing from this list needs a session, so new screens are protected by default.
const PUBLIC_ROUTES: ReadonlySet<Route['name']> = new Set(['home', 'login', 'not_found']);
const GUEST_ONLY_ROUTES: ReadonlySet<Route['name']> = new Set(['login']);

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to]);
  return null;
}

function Screen({ route, search }: { route: Route; search: URLSearchParams }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'login':
      return <LoginScreen search={search} />;
    case 'not_found':
      return <NotFoundScreen />;
  }
}

/** Route guard for the user experience only; the API re-checks every request. */
function Router() {
  const { route, search } = useLocation();
  const { state } = useAuth();

  if (state.status === 'loading') {
    return <p aria-busy="true">Loading WhatsUpTeam…</p>;
  }

  const signedIn = state.status === 'authenticated';
  if (signedIn && GUEST_ONLY_ROUTES.has(route.name)) {
    return <Redirect to="/" />;
  }
  if (!signedIn && !PUBLIC_ROUTES.has(route.name)) {
    return <Redirect to="/login" />;
  }

  return (
    <AppShell route={route}>
      <Screen route={route} search={search} />
    </AppShell>
  );
}

export default function App({ api }: { api: WhatsUpApi }) {
  return (
    <ApiContext.Provider value={api}>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </ApiContext.Provider>
  );
}
