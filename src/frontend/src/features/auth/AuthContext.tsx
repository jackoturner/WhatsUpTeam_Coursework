import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useApi } from '../../hooks/useApi';
import { navigate } from '../../hooks/useRoute';
import { errorMessage, isApiError } from '../../services/apiError';
import type { User } from '../../types/api';

// The session itself lives in an HttpOnly cookie owned by the back-office.
// The front only remembers *who* is signed in, never a token.
export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User };

interface AuthContextValue {
  state: AuthState;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Turns an API error into a message; an expired session sends the user to sign in. */
  handleError(error: unknown): string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    api.auth
      .me()
      .then((user) => {
        if (active) setState({ status: 'authenticated', user });
      })
      .catch(() => {
        if (active) setState({ status: 'anonymous' });
      });
    return () => {
      active = false;
    };
  }, [api]);

  const login = useCallback(
    async (username: string, password: string) => {
      const user = await api.auth.login(username, password);
      setState({ status: 'authenticated', user });
    },
    [api],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      // Forget the user locally even if the server call failed.
      setState({ status: 'anonymous' });
      navigate('/login', { replace: true });
    }
  }, [api]);

  const handleError = useCallback((error: unknown) => {
    if (isApiError(error, 'unauthenticated')) {
      setState({ status: 'anonymous' });
      navigate('/login?expired=1', { replace: true });
    }
    return errorMessage(error);
  }, []);

  const value = useMemo(
    () => ({ state, login, logout, handleError }),
    [state, login, logout, handleError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}
