import { useState } from 'react';
import type { FormEvent } from 'react';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import Notice from '../../../components/Notice';
import TextField from '../../../components/TextField';
import { useAuth } from '../../../features/auth/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { navigate } from '../../../hooks/useRoute';
import { errorMessage } from '../../../services/apiError';
import styles from '../screens.module.css';

export default function LoginScreen({ search }: { search: URLSearchParams }) {
  const api = useApi();
  const { state, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const authUnavailable = state.status === 'anonymous' && !state.authAvailable;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
      // FE-02: straight into the application (the chat interface arrives with FE-03).
      navigate('/', { replace: true });
    } catch (loginError) {
      // One generic message whatever failed, so usernames cannot be probed: the server's
      // message is reused as-is.
      setError(errorMessage(loginError));
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.narrow}>
      <h1>Sign in</h1>
      {search.get('expired') === '1' && <Notice tone="warning">Your session has ended. Please sign in again.</Notice>}
      {authUnavailable && (
        <Notice tone="warning">
          The back-office does not provide sign-in yet (BE-03 #6). Use the mock build to try it.
        </Notice>
      )}
      {api.demoNotice && <Notice tone="info">{api.demoNotice}</Notice>}
      <Card>
        <form onSubmit={(event) => void submit(event)} aria-label="Sign in">
          {error && <Notice tone="error">{error}</Notice>}
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            required
            maxLength={32}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
