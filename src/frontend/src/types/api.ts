// Shapes of the sign-in part of the API contract (proposal for SH-01, issue #4).
// The backend owns every rule; these types only describe what the front expects back.

export type Role = 'employee' | 'group_manager' | 'org_admin';

export const ROLES: readonly Role[] = ['employee', 'group_manager', 'org_admin'];

export interface Organisation {
  id: number;
  name: string;
}

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  organisation: Organisation;
  avatar_url: string | null;
}

/** One implementation talks to FastAPI (live), the other is an in-browser demo (mock). */
export interface WhatsUpApi {
  mode: 'live' | 'mock';
  /** Mock mode only: the fictional demo accounts shown on the login screen. */
  demoNotice?: string;
  auth: {
    me(): Promise<User>;
    login(username: string, password: string): Promise<User>;
    logout(): Promise<void>;
  };
}
