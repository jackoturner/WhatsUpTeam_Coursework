// In-browser mock of the sign-in API, used only when VITE_API_MODE=mock.
// It mirrors the rules the real back-office must enforce (BE-03 #6): one generic error for
// any wrong username or password, and a temporary lock after repeated failures.
// Accounts live in localStorage and the session in sessionStorage (one user per tab).
// It is NOT a security control: a browser-side mock can always be bypassed.
import { ApiError } from '../apiError';
import type { User, WhatsUpApi } from '../../types/api';
import { createSeed, MOCK_DEMO_PASSWORD } from './mockSeed';
import type { MockData, MockUser } from './mockSeed';

const DATA_KEY = 'whatsup-mock-auth-v1';
const SESSION_KEY = 'whatsup-mock-session-v2';
const LATENCY_MS = 120;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 30_000;
const GENERIC_LOGIN_ERROR = 'Invalid username or password.';

function loadData(): MockData {
  try {
    const saved = window.localStorage.getItem(DATA_KEY);
    if (saved !== null) return JSON.parse(saved) as MockData;
  } catch {
    // Storage blocked or corrupt: fall back to a fresh seed.
  }
  return createSeed();
}

function saveData(data: MockData): void {
  try {
    window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch {
    // The demo still works for this call when storage is unavailable.
  }
}

/** The tab's session: plays the role of the server-side session store. */
function sessionUserId(): number | null {
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY);
    return value === null ? null : Number(value);
  } catch {
    return null;
  }
}

function setSessionUserId(userId: number | null): void {
  try {
    if (userId === null) window.sessionStorage.removeItem(SESSION_KEY);
    else window.sessionStorage.setItem(SESSION_KEY, String(userId));
  } catch {
    // ignore
  }
}

function delay(ms = LATENCY_MS): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function requireUser(data: MockData): MockUser {
  const current = data.users.find((candidate) => candidate.id === sessionUserId());
  if (current === undefined) throw new ApiError('unauthenticated');
  return current;
}

function toUser(data: MockData, mockUser: MockUser): User {
  const organisation = data.organisations.find((org) => org.id === mockUser.organisation_id);
  return {
    id: mockUser.id,
    username: mockUser.username,
    display_name: mockUser.display_name,
    role: mockUser.role,
    organisation: organisation ?? { id: mockUser.organisation_id, name: 'Unknown' },
    avatar_url: mockUser.avatar_url,
  };
}

export function createMockApi(): WhatsUpApi {
  return {
    mode: 'mock',
    demoNotice:
      'Demo accounts: alice, bob (employees), grace (group manager), itadmin (IT admin) — ' +
      `Acme Legal; mallory — Globex Finance. Password for all: ${MOCK_DEMO_PASSWORD}`,

    auth: {
      async me() {
        await delay();
        const data = loadData();
        return toUser(data, requireUser(data));
      },

      async login(username, password) {
        await delay();
        const data = loadData();
        const candidate = data.users.find((entry) => entry.username === username);
        if (candidate !== undefined && candidate.locked_until > Date.now()) {
          throw new ApiError('rate_limited');
        }
        if (candidate === undefined || candidate.password !== password) {
          if (candidate !== undefined) {
            candidate.failed_logins += 1;
            if (candidate.failed_logins >= MAX_FAILED_LOGINS) {
              candidate.locked_until = Date.now() + LOCKOUT_MS;
              candidate.failed_logins = 0;
            }
            saveData(data);
          }
          throw new ApiError('unauthenticated', GENERIC_LOGIN_ERROR);
        }
        candidate.failed_logins = 0;
        setSessionUserId(candidate.id);
        saveData(data);
        return toUser(data, candidate);
      },

      async logout() {
        await delay();
        setSessionUserId(null);
      },
    },
  };
}
