import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Button from '../../../components/Button';
import Notice from '../../../components/Notice';
import PageHeader from '../../../components/PageHeader';
import TextField from '../../../components/TextField';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { navigate } from '../../../hooks/useRoute';
import styles from './SettingsScreen.module.css';

function roleLabel(role: string): string {
  if (role === 'org_admin') return 'IT Admin';
  return role === 'group_manager' ? 'Group Manager' : 'Employee';
}

export default function SettingsScreen() {
  const api = useApi();
  const { state, updateUser, logout, handleError } = useAuth();
  const user = state.status === 'authenticated' ? state.user : null;
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user !== null) setDisplayName(user.display_name);
  }, [user?.id, user?.display_name]);

  if (user === null) return null;
  const currentUser = user;

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const updated = await api.auth.updateProfile(displayName.trim());
      updateUser(updated);
      setNotice('Profile updated.');
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setProblem('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      await logout();
      navigate('/login?password_changed=1', { replace: true });
    } catch (error) {
      setProblem(handleError(error));
      setBusy(false);
    }
  }

  async function saveAvatar() {
    if (avatarFile === null) return;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      updateUser(await api.auth.uploadAvatar(avatarFile));
      setAvatarFile(null);
      setNotice('Profile photo updated.');
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await api.auth.removeAvatar();
      updateUser({ ...currentUser, avatar_url: null });
      setNotice('Profile photo removed.');
    } catch (error) {
      setProblem(handleError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Account settings"
        description="Manage your profile, password and account security."
        icon={<><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8H16l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.7z" /></>}
      />

      {problem !== null && <Notice tone="error">{problem}</Notice>}
      {notice !== null && <Notice tone="success">{notice}</Notice>}

      <section className={styles.card} aria-labelledby="profile-heading">
        <h3 id="profile-heading">Profile</h3>
        <div className={styles.avatarControls}>
          {currentUser.avatar_url !== null && (
            <img className={styles.profileAvatar} src={currentUser.avatar_url} alt={`${currentUser.display_name} profile`} />
          )}
          <label>
            Profile photo (PNG, JPEG or WebP; up to 2 MB)
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </label>
          <Button variant="ghost" disabled={busy || avatarFile === null} onClick={() => void saveAvatar()}>
            Upload photo
          </Button>
          {currentUser.avatar_url !== null && (
            <Button variant="danger" disabled={busy} onClick={() => void removeAvatar()}>
              Remove photo
            </Button>
          )}
        </div>
        <dl className={styles.identity}>
          <div><dt>Username</dt><dd>{currentUser.username}</dd></div>
          <div><dt>Organisation</dt><dd>{currentUser.organisation.name}</dd></div>
          <div><dt>Role</dt><dd>{roleLabel(currentUser.role)}</dd></div>
        </dl>
        <form onSubmit={(event) => void saveProfile(event)}>
          <TextField
            label="Display name"
            autoComplete="name"
            maxLength={100}
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <Button type="submit" disabled={busy || displayName.trim() === '' || displayName.trim() === currentUser.display_name}>
            Save profile
          </Button>
        </form>
      </section>

      <section className={styles.card} aria-labelledby="password-heading">
        <h3 id="password-heading">Change password</h3>
        <p className={styles.muted}>Changing your password signs out all active sessions.</p>
        <form onSubmit={(event) => void changePassword(event)}>
          <TextField
            label="Current password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            hint="Use at least 12 characters."
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <TextField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <Button type="submit" disabled={busy || newPassword.length < 12}>
            Change password
          </Button>
        </form>
      </section>

    </div>
  );
}
