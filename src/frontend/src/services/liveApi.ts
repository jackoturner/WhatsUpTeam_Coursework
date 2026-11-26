import type { WhatsUpApi } from '../types/api';
import { parseOrThrow, request } from './httpClient';
import { parseUser } from './parsers';

async function ensureCsrfToken(): Promise<void> {
  await request('GET', '/api/auth/csrf');
}

export const liveApi: WhatsUpApi = {
  auth: {
    async me() {
      await ensureCsrfToken();
      return parseOrThrow(await request('GET', '/api/auth/me'), parseUser);
    },
    async login(username, password) {
      await ensureCsrfToken();
      const data = await request('POST', '/api/auth/login', { json: { username, password } });
      return parseOrThrow(data, parseUser);
    },
    async logout() {
      await request('POST', '/api/auth/logout');
    },
  },
};
