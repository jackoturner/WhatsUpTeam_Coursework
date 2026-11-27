import { useCallback, useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import Button from '../../../components/Button';
import PageHeader from '../../../components/PageHeader';
import TextField from '../../../components/TextField';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { navigate } from '../../../hooks/useRoute';
import type { ChatGroup, Contact } from '../../../types/api';
import styles from './GroupsScreen.module.css';

type Load<T> = { status: 'loading' } | { status: 'ready'; items: T[] } | { status: 'error'; text: string };

function roleCanCreate(role: string): boolean {
  return role === 'group_manager' || role === 'org_admin';
}

export default function GroupsScreen() {
  const api = useApi();
  const { state, handleError } = useAuth();
  const [groups, setGroups] = useState<Load<ChatGroup>>({ status: 'loading' });
  const [contacts, setContacts] = useState<Load<Contact>>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState('');
  const [createMemberIds, setCreateMemberIds] = useState<string[]>([]);
  const [addMemberIds, setAddMemberIds] = useState<string[]>([]);
  const [rename, setRename] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const createId = useId();
  const addId = useId();

  const refreshGroups = useCallback(async () => {
    const items = await api.groups.list();
    setGroups({ status: 'ready', items });
  }, [api]);

  useEffect(() => {
    let active = true;
    Promise.all([api.groups.list(), api.contacts.list()])
      .then(([groupItems, contactItems]) => {
        if (!active) return;
        setGroups({ status: 'ready', items: groupItems });
        setContacts({ status: 'ready', items: contactItems });
        setSelectedId((current) => current ?? groupItems[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (active) {
          const text = handleError(error);
          setGroups({ status: 'error', text });
          setContacts({ status: 'error', text });
        }
      });
    return () => {
      active = false;
    };
  }, [api, handleError]);

  const selected = groups.status === 'ready'
    ? groups.items.find((group) => group.id === selectedId) ?? null
    : null;
  const selectableContacts = contacts.status === 'ready'
    ? contacts.items.filter((contact) => !selected?.members.some((member) => member.user_id === contact.id))
    : [];
  const canCreate = state.status === 'authenticated' && roleCanCreate(state.user.role);

  function toggleSelection(value: string, selectedValues: string[], setValues: (values: string[]) => void) {
    setValues(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value],
    );
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const created = await api.groups.create(groupName.trim(), createMemberIds.map(Number));
      await refreshGroups();
      setSelectedId(created.id);
      setGroupName('');
      setCreateMemberIds([]);
      setNotice('Group created.');
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setBusy(false);
    }
  }

  async function renameGroup(event: FormEvent) {
    event.preventDefault();
    if (selected === null) return;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await api.groups.rename(selected.id, rename.trim());
      await refreshGroups();
      setNotice('Group name updated.');
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setBusy(false);
    }
  }

  async function addMembers(event: FormEvent) {
    event.preventDefault();
    if (selected === null || addMemberIds.length === 0) return;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await api.groups.addMembers(selected.id, addMemberIds.map(Number));
      await refreshGroups();
      setAddMemberIds([]);
      setNotice('Group members added.');
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(memberId: number) {
    if (selected === null) return;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await api.groups.removeMember(selected.id, memberId);
      await refreshGroups();
      setNotice('Group member removed.');
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (selected !== null) setRename(selected.name);
  }, [selected?.id, selected?.name]);

  if (groups.status === 'loading' || contacts.status === 'loading') {
    return <p aria-busy="true">Loading groups…</p>;
  }
  if (groups.status === 'error' || contacts.status === 'error') {
    return <p className={styles.notice} role="alert">{groups.status === 'error' ? groups.text : contacts.status === 'error' ? contacts.text : ''}</p>;
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Groups"
        description="Create and manage organisation groups. Group managers and IT admins can manage membership."
        icon={<><circle cx="9" cy="8" r="2.5" /><circle cx="17" cy="9" r="2" /><path d="M3 19v-1a6 6 0 0 1 12 0v1zM16 15a5 5 0 0 1 5 5" /></>}
      />

      {problem !== null && <p className={styles.notice} role="alert">{problem}</p>}
      {notice !== null && <p className={styles.success} role="status">{notice}</p>}

      {canCreate && (
        <form className={styles.card} onSubmit={(event) => void createGroup(event)}>
          <h3>Create a group</h3>
          <TextField
            id={createId}
            label="Group name"
            maxLength={100}
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            required
          />
          {contacts.items.length > 0 && (
            <fieldset className={styles.membersField}>
              <legend>Add members (optional)</legend>
              <div className={styles.options}>
                {contacts.items.map((contact) => (
                  <label key={contact.id}>
                    <input
                      type="checkbox"
                      checked={createMemberIds.includes(String(contact.id))}
                      onChange={() => toggleSelection(String(contact.id), createMemberIds, setCreateMemberIds)}
                    />
                    {contact.display_name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <Button type="submit" disabled={busy || groupName.trim() === ''}>
            {busy ? 'Working…' : 'Create group'}
          </Button>
        </form>
      )}

      <div className={styles.layout}>
        <section className={styles.card} aria-label="Your groups">
          <h3>Your groups</h3>
          {groups.items.length === 0 ? (
            <p className={styles.muted}>You are not a member of any groups yet.</p>
          ) : (
            <ul className={styles.groupList}>
              {groups.items.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    className={styles.groupButton}
                    aria-current={group.id === selectedId ? 'true' : undefined}
                    onClick={() => setSelectedId(group.id)}
                  >
                    <strong>{group.name}</strong>
                    <span>{group.members.length} members</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selected !== null && (
          <section className={styles.card} aria-label={`${selected.name} group details`}>
            <div className={styles.heading}>
              <h3>{selected.name}</h3>
              <Button variant="ghost" onClick={() => navigate(`/chats?conversation=${selected.id}`)}>
                Open chat
              </Button>
            </div>

            {selected.can_manage && (
              <>
                <form className={styles.inlineForm} onSubmit={(event) => void renameGroup(event)}>
                  <TextField
                    label="Group name"
                    maxLength={100}
                    value={rename}
                    onChange={(event) => setRename(event.target.value)}
                    required
                  />
                  <Button type="submit" variant="ghost" disabled={busy || rename.trim() === '' || rename.trim() === selected.name}>
                    Rename
                  </Button>
                </form>

                {selectableContacts.length > 0 && (
                  <form className={styles.inlineForm} onSubmit={(event) => void addMembers(event)}>
                    <fieldset className={styles.membersField}>
                      <legend id={addId}>Add members</legend>
                      <div className={styles.options}>
                        {selectableContacts.map((contact) => (
                          <label key={contact.id}>
                            <input
                              type="checkbox"
                              checked={addMemberIds.includes(String(contact.id))}
                              onChange={() => toggleSelection(String(contact.id), addMemberIds, setAddMemberIds)}
                            />
                            {contact.display_name}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <Button type="submit" variant="ghost" disabled={busy || addMemberIds.length === 0}>
                      Add selected
                    </Button>
                  </form>
                )}
              </>
            )}

            <h4>Members</h4>
            <ul className={styles.memberList}>
              {selected.members.map((member) => (
                <li key={member.user_id}>
                  <span>{member.display_name} <small>@{member.username}</small></span>
                  {selected.can_manage && (
                    <Button
                      variant="danger"
                      disabled={busy}
                      aria-label={`Remove ${member.display_name} from ${selected.name}`}
                      onClick={() => void removeMember(member.user_id)}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
