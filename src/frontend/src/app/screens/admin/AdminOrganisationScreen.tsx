import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import AdminTabs from '../../../components/AdminTabs';
import Button from '../../../components/Button';
import Notice from '../../../components/Notice';
import PageHeader from '../../../components/PageHeader';
import TextField from '../../../components/TextField';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import type { ManagedUser } from '../../../types/api';
import styles from './AdminUsersScreen.module.css';

type MemberLoad =
  | { status: 'loading' }
  | { status: 'ready'; users: ManagedUser[] }
  | { status: 'error'; text: string };

export default function AdminOrganisationScreen() {
  const api = useApi();
  const { state, updateUser, handleError } = useAuth();
  const user = state.status === 'authenticated' ? state.user : null;
  const [name, setName] = useState(user?.organisation.name ?? '');
  const [members, setMembers] = useState<MemberLoad>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (user !== null) setName(user.organisation.name);
  }, [user?.organisation.id, user?.organisation.name]);

  useEffect(() => {
    let active = true;
    api.admin.listUsers()
      .then((users) => {
        if (active) setMembers({ status: 'ready', users });
      })
      .catch((error: unknown) => {
        if (active) setMembers({ status: 'error', text: handleError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, handleError]);

  if (user === null) return null;
  const currentUser = user;

  async function saveOrganisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const updated = await api.admin.updateOrganisation(name.trim());
      updateUser({ ...currentUser, organisation: updated });
      setName(updated.name);
      setNotice('Organisation settings updated.');
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setBusy(false);
    }
  }

  const activeUsers = members.status === 'ready'
    ? members.users.filter((member) => member.is_active).length
    : null;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Organisation settings"
        description="Manage the identity and membership of your current organisation."
        icon={<><path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h1M14 10h1M9 14h1M14 14h1M10 21v-3h4v3" /></>}
      />
      <AdminTabs active="/admin/organisation" />
      {problem !== null && <Notice tone="error">{problem}</Notice>}
      {notice !== null && <Notice tone="success">{notice}</Notice>}
      <section className={styles.card} aria-labelledby="organisation-profile-heading">
        <h2 id="organisation-profile-heading">Organisation profile</h2>
        <dl className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <span>Organisation ID</span>
            <strong>{user.organisation.id}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>Active members</span>
            <strong>
              {members.status === 'loading' ? '…' : members.status === 'error' ? 'Unavailable' : activeUsers}
            </strong>
          </div>
        </dl>
        {members.status === 'error' && <p className={styles.error} role="alert">{members.text}</p>}
        <form onSubmit={(event) => void saveOrganisation(event)}>
          <TextField
            label="Organisation name"
            maxLength={100}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={busy || name.trim() === '' || name.trim() === user.organisation.name}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </section>
    </div>
  );
}
