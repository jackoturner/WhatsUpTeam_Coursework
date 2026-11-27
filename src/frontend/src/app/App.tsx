import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';
import { ApiContext } from '../hooks/useApi';
import { navigate, useLocation } from '../hooks/useRoute';
import type { Route } from '../hooks/useRoute';
import type { WhatsUpApi } from '../types/api';
import AppShell from './AppShell';
import AccessDeniedScreen from './screens/access-denied/AccessDeniedScreen';
import AuditScreen from './screens/audit/AuditScreen';
import AdminOrganisationScreen from './screens/admin/AdminOrganisationScreen';
import AdminRolesScreen from './screens/admin/AdminRolesScreen';
import AdminUsersScreen from './screens/admin/AdminUsersScreen';
import ChatsScreen from './screens/chats/ChatsScreen';
import ContactsScreen from './screens/contacts/ContactsScreen';
import FilesScreen from './screens/files/FilesScreen';
import GroupsScreen from './screens/groups/GroupsScreen';
import LoginScreen from './screens/login/LoginScreen';
import NotFoundScreen from './screens/notfound/NotFoundScreen';
import ReportingScreen from './screens/reporting/ReportingScreen';
import SettingsScreen from './screens/settings/SettingsScreen';

// Every route missing from this list needs a session, so new screens are protected by default.
const PUBLIC_ROUTES: ReadonlySet<Route['name']> = new Set(['login', 'not_found', 'forbidden']);
const GUEST_ONLY_ROUTES: ReadonlySet<Route['name']> = new Set(['login']);
const ADMIN_ROUTES: ReadonlySet<Route['name']> = new Set([
  'audit',
  'admin_users',
  'admin_roles',
  'admin_organisation',
]);

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to]);
  return null;
}

function Screen({ route, search }: { route: Route; search: URLSearchParams }) {
  switch (route.name) {
    case 'login':
      return <LoginScreen search={search} />;
    case 'forbidden':
      return <AccessDeniedScreen />;
    case 'not_found':
      return <NotFoundScreen />;
    case 'reporting':
      // Keyed on the message so a different message always starts with an empty form.
      return <ReportingScreen key={search.get('message') ?? ''} search={search} />;
    case 'audit':
      return <AuditScreen />;
    case 'admin_users':
      return <AdminUsersScreen />;
    case 'admin_roles':
      return <AdminRolesScreen />;
    case 'admin_organisation':
      return <AdminOrganisationScreen />;
    case 'chats':
      return <ChatsScreen conversationId={route.conversationId} />;
    case 'files':
      return <FilesScreen />;
    case 'contacts':
      return <ContactsScreen />;
    case 'groups':
      return <GroupsScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
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
    return <Redirect to="/chats" />;
  }
  if (
    state.status === 'authenticated'
    && ADMIN_ROUTES.has(route.name)
    && state.user.role !== 'org_admin'
  ) {
    return <Redirect to="/403" />;
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
