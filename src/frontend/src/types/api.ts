// Shapes of the sign-in contract. The backend owns authentication and authorization rules.

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

export interface WhatsUpApi {
  auth: {
    me(): Promise<User>;
    login(username: string, password: string): Promise<User>;
    logout(): Promise<void>;
  };
}
