import { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/Button';
import PageHeader from '../../../components/PageHeader';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { navigate } from '../../../hooks/useRoute';
import type { Contact } from '../../../types/api';
import styles from './ContactsScreen.module.css';

type Load =
  | { status: 'loading' }
  | { status: 'ready'; contacts: Contact[] }
  | { status: 'error'; text: string };

function roleLabel(role: Contact['role']): string {
  if (role === 'org_admin') return 'IT Admin';
  return role === 'group_manager' ? 'Group Manager' : 'Employee';
}

export default function ContactsScreen() {
  const api = useApi();
  const { handleError } = useAuth();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [startingId, setStartingId] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.contacts
      .list()
      .then((contacts) => {
        if (active) setLoad({ status: 'ready', contacts });
      })
      .catch((error: unknown) => {
        if (active) setLoad({ status: 'error', text: handleError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, handleError]);

  const filteredContacts = useMemo(() => {
    if (load.status !== 'ready') return [];
    const needle = query.trim().toLowerCase();
    if (needle === '') return load.contacts;
    return load.contacts.filter((contact) =>
      [contact.display_name, contact.username, roleLabel(contact.role)]
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [load, query]);

  async function startChat(contact: Contact) {
    setStartingId(contact.id);
    setProblem(null);
    try {
      const conversation = await api.chats.startDirect(contact.id);
      navigate(`/chats?conversation=${conversation.id}`);
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Contacts"
        description="Find active colleagues in your organisation and start a private conversation."
        icon={<><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1zM17 5a3 3 0 0 1 0 6M19 15a5 5 0 0 1 2 4v1" /></>}
      />

      <label className={styles.searchLabel} htmlFor="contact-search">Search contacts</label>
      <input
        id="contact-search"
        className={styles.search}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name, username or role"
      />

      {problem !== null && <p className={styles.notice} role="alert">{problem}</p>}
      {load.status === 'loading' && <p aria-busy="true">Loading contacts…</p>}
      {load.status === 'error' && <p className={styles.notice} role="alert">{load.text}</p>}
      {load.status === 'ready' && filteredContacts.length === 0 && (
        <p className={styles.empty}>
          {load.contacts.length === 0 ? 'No active colleagues are available yet.' : 'No contacts match your search.'}
        </p>
      )}
      {load.status === 'ready' && filteredContacts.length > 0 && (
        <ul className={styles.list} aria-label="Organisation contacts">
          {filteredContacts.map((contact) => (
            <li className={styles.contact} key={contact.id}>
              <span className={styles.avatar} aria-hidden="true">
                {contact.display_name.split(/\s+/).map((part) => part[0] ?? '').slice(0, 2).join('').toUpperCase()}
              </span>
              <span className={styles.details}>
                <strong>{contact.display_name}</strong>
                <span>@{contact.username} · {roleLabel(contact.role)}</span>
              </span>
              <Button
                variant="ghost"
                disabled={startingId !== null}
                onClick={() => void startChat(contact)}
              >
                {startingId === contact.id ? 'Opening…' : 'Message'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
