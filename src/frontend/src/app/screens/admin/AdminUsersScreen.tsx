import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import AdminTabs from '../../../components/AdminTabs';
import Button from '../../../components/Button';
import Link from '../../../components/Link';
import PageHeader from '../../../components/PageHeader';
import TextField from '../../../components/TextField';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { ROLES } from '../../../types/api';
import type { AuditEvent, ManagedUser, Role } from '../../../types/api';
import { formatDateTime } from '../../../utils/format';
import styles from './AdminUsersScreen.module.css';

type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; items: T[] }
  | { status: 'error'; text: string };
type UserDraft = { role: Role; isActive: boolean };
const PAGE_SIZE = 10;

function roleLabel(role: Role): string {
  if (role === 'org_admin') return 'IT Admin';
  return role === 'group_manager' ? 'Group Manager' : 'Employee';
}

function eventLabel(event: AuditEvent): string {
  return event.event_type.replaceAll('_', ' ');
}

export default function AdminUsersScreen() {
  const api = useApi();
  const { handleError } = useAuth();
  const [load, setLoad] = useState<Load<ManagedUser>>({ status: 'loading' });
  const [recentEvents, setRecentEvents] = useState<Load<AuditEvent>>({ status: 'loading' });
  const [drafts, setDrafts] = useState<Record<number, UserDraft>>({});
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const users = await api.admin.listUsers();
    setLoad({ status: 'ready', items: users });
    setDrafts(Object.fromEntries(users.map((user) => [
      user.id,
      { role: user.role, isActive: user.is_active },
    ])));
  }

  useEffect(() => {
    let active = true;
    api.admin.listUsers()
      .then((users) => {
        if (!active) return;
        setLoad({ status: 'ready', items: users });
        setDrafts(Object.fromEntries(users.map((user) => [
          user.id,
          { role: user.role, isActive: user.is_active },
        ])));
      })
      .catch((error: unknown) => {
        if (active) setLoad({ status: 'error', text: handleError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, handleError]);

  useEffect(() => {
    let active = true;
    api.admin.listAuditEvents({ offset: 0 })
      .then((result) => {
        if (active) setRecentEvents({ status: 'ready', items: result.items.slice(0, 5) });
      })
      .catch((error: unknown) => {
        if (active) setRecentEvents({ status: 'error', text: handleError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, handleError]);

  const filteredUsers = useMemo(() => {
    if (load.status !== 'ready') return [];
    const needle = query.trim().toLowerCase();
    return load.items.filter((user) => {
      const matchesQuery = needle === ''
        || user.display_name.toLowerCase().includes(needle)
        || user.username.toLowerCase().includes(needle);
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' ? user.is_active : !user.is_active);
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [load, query, roleFilter, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pageUsers = filteredUsers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await api.admin.createUser({ username, displayName, password, role });
      await refresh();
      setUsername('');
      setDisplayName('');
      setPassword('');
      setRole('employee');
      setShowCreate(false);
      setPage(0);
      setNotice('User created.');
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveUser(user: ManagedUser) {
    const draft = drafts[user.id];
    if (draft === undefined) return;
    if (draft.role !== user.role && !window.confirm(`Change ${user.username} to ${roleLabel(draft.role)}?`)) {
      setDrafts((current) => ({ ...current, [user.id]: { role: user.role, isActive: draft.isActive } }));
      return;
    }
    if (draft.isActive !== user.is_active && !window.confirm(`${draft.isActive ? 'Reactivate' : 'Deactivate'} ${user.username}?`)) {
      setDrafts((current) => ({ ...current, [user.id]: { ...draft, isActive: user.is_active } }));
      return;
    }
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await api.admin.updateUser(user.id, draft);
      await refresh();
      setNotice(`Updated ${user.username}.`);
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setBusy(false);
    }
  }

  const activeCount = load.status === 'ready' ? load.items.filter((user) => user.is_active).length : 0;
  const managerCount = load.status === 'ready' ? load.items.filter((user) => user.role === 'group_manager').length : 0;
  const adminCount = load.status === 'ready' ? load.items.filter((user) => user.role === 'org_admin' && user.is_active).length : 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Organisation administration"
        description="Manage users, roles and security for your organisation."
        icon={<><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1zM17 8h4M19 6v4M17 16h4" /></>}
      />
      <AdminTabs active="/admin/users" />
      {problem !== null && <p className={styles.error} role="alert">{problem}</p>}
      {notice !== null && <p className={styles.success} role="status">{notice}</p>}

      <div className={styles.contentGrid}>
        <section className={styles.card} aria-labelledby="users-heading">
          <div className={styles.cardHeading}>
            <div>
              <h2 id="users-heading">User management</h2>
              <p className={styles.muted}>Manage organisation members and account roles.</p>
            </div>
            <Button onClick={() => setShowCreate((visible) => !visible)}>
              {showCreate ? 'Close' : 'Add user'}
            </Button>
          </div>
          {showCreate && (
            <form className={styles.createForm} onSubmit={(event) => void createUser(event)}>
              <h3>Create user</h3>
              <div className={styles.formGrid}>
                <TextField label="Username" autoComplete="off" maxLength={32} required value={username} onChange={(event) => setUsername(event.target.value)} />
                <TextField label="Display name" autoComplete="name" maxLength={100} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                <TextField label="Initial password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required hint="At least 12 characters." value={password} onChange={(event) => setPassword(event.target.value)} />
                <label className={styles.field}>
                  Role
                  <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                    {ROLES.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}
                  </select>
                </label>
              </div>
              <Button type="submit" disabled={busy || password.length < 12}>
                {busy ? 'Creating…' : 'Create user'}
              </Button>
            </form>
          )}

          <div className={styles.filters}>
            <label className="visually-hidden" htmlFor="user-search">Search users</label>
            <input
              id="user-search"
              className={styles.search}
              type="search"
              placeholder="Search name or username"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
            <label className="visually-hidden" htmlFor="user-role-filter">Filter users by role</label>
            <select id="user-role-filter" className={styles.filterSelect} value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(0); }}>
              <option value="all">All roles</option>
              {ROLES.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}
            </select>
            <label className="visually-hidden" htmlFor="user-status-filter">Filter users by status</label>
            <select id="user-status-filter" className={styles.filterSelect} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {load.status === 'loading' && <p aria-busy="true">Loading users…</p>}
          {load.status === 'error' && <p className={styles.error} role="alert">{load.text}</p>}
          {load.status === 'ready' && (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
                  <tbody>
                    {pageUsers.map((user) => {
                      const draft = drafts[user.id];
                      if (draft === undefined) return null;
                      return (
                        <tr key={user.id}>
                          <td className={styles.userName}>
                            <strong>{user.display_name}</strong>
                            <span>{user.username}</span>
                          </td>
                          <td>
                            <label className="visually-hidden" htmlFor={`role-${user.id}`}>Role for {user.username}</label>
                            <select
                              id={`role-${user.id}`}
                              value={draft.role}
                              onChange={(event) => setDrafts((current) => ({
                                ...current,
                                [user.id]: { ...draft, role: event.target.value as Role },
                              }))}
                            >
                              {ROLES.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}
                            </select>
                          </td>
                          <td>
                            <span className={draft.isActive ? styles.statusActive : styles.statusInactive}>
                              {draft.isActive ? 'Active' : 'Inactive'}
                            </span>
                            <label className={styles.statusToggle}>
                              <span className="visually-hidden">{draft.isActive ? 'Deactivate' : 'Activate'} {user.username}</span>
                              <input
                                type="checkbox"
                                checked={draft.isActive}
                                onChange={(event) => setDrafts((current) => ({
                                  ...current,
                                  [user.id]: { ...draft, isActive: event.target.checked },
                                }))}
                              />
                            </label>
                          </td>
                          <td>
                            <Button
                              variant="ghost"
                              disabled={busy || (draft.role === user.role && draft.isActive === user.is_active)}
                              onClick={() => void saveUser(user)}
                            >
                              Save
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {pageUsers.length === 0 && <tr><td colSpan={4}>No users match these filters.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className={styles.pagination}>
                <span>{filteredUsers.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length} users</span>
                <Button variant="ghost" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</Button>
                <span>Page {page + 1} of {pageCount}</span>
                <Button variant="ghost" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</Button>
              </div>
            </>
          )}
        </section>

        <aside className={styles.sideColumn}>
          <section className={styles.card} aria-label="Organisation access overview">
            <h2>Access overview</h2>
            {load.status === 'ready' ? (
              <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}><strong>{activeCount}</strong><span>Active users</span></div>
                <div className={styles.summaryCard}><strong>{managerCount}</strong><span>Group managers</span></div>
                <div className={styles.summaryCard}><strong>{adminCount}</strong><span>IT administrators</span></div>
              </div>
            ) : (
              <p className={styles.muted} aria-busy={load.status === 'loading'}>
                {load.status === 'loading' ? 'Loading organisation users…' : 'User totals are unavailable.'}
              </p>
            )}
          </section>
          <section className={styles.card} aria-labelledby="recent-events-heading">
            <div className={styles.cardHeading}>
              <h2 id="recent-events-heading">Recent security events</h2>
              <Link to="/admin/audit">View audit log</Link>
            </div>
            {recentEvents.status === 'loading' && <p className={styles.muted} aria-busy="true">Loading recent events…</p>}
            {recentEvents.status === 'error' && <p className={styles.error} role="alert">{recentEvents.text}</p>}
            {recentEvents.status === 'ready' && recentEvents.items.length === 0 && (
              <p className={styles.muted}>No audit events are available.</p>
            )}
            {recentEvents.status === 'ready' && recentEvents.items.length > 0 && (
              <ul className={styles.eventList}>
                {recentEvents.items.map((event) => (
                  <li key={event.id}>
                    <strong>{eventLabel(event)}</strong>
                    <span>{event.actor_username ?? 'System'} · {formatDateTime(event.timestamp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
