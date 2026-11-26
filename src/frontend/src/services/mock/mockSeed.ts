// Demo data for mock mode only (VITE_API_MODE=mock). Fictional people and organisations;
// the shared demo password is not a secret and never exists in the live back-office.
import type { Organisation, Role } from '../../types/api';

export const MOCK_DEMO_PASSWORD = 'demo-password-2026';

export interface MockUser {
  id: number;
  username: string;
  password: string;
  display_name: string;
  role: Role;
  organisation_id: number;
  avatar_url: string | null;
  failed_logins: number;
  locked_until: number;
}

export interface MockData {
  organisations: Organisation[];
  users: MockUser[];
}

function user(id: number, username: string, displayName: string, role: Role, orgId: number): MockUser {
  return {
    id,
    username,
    password: MOCK_DEMO_PASSWORD,
    display_name: displayName,
    role,
    organisation_id: orgId,
    avatar_url: null,
    failed_logins: 0,
    locked_until: 0,
  };
}

export function createSeed(): MockData {
  return {
    organisations: [
      { id: 1, name: 'Acme Legal' },
      { id: 2, name: 'Globex Finance' },
    ],
    users: [
      user(1, 'alice', 'Alice Martin', 'employee', 1),
      user(2, 'bob', 'Bob Singh', 'employee', 1),
      user(3, 'grace', 'Grace Okafor', 'group_manager', 1),
      user(4, 'itadmin', 'IT Admin', 'org_admin', 1),
      user(5, 'mallory', 'Mallory Reed', 'employee', 2),
    ],
  };
}
