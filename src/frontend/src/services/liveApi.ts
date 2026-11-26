// Live implementation: talks to the FastAPI back-office through the same-origin /api proxy.
// The /api/auth endpoints follow the contract proposal (SH-01 #4). Until BE-03 (#6) adds
// them, they answer "not available" and the login screen says so.
import type { WhatsUpApi } from '../types/api';
import { parseOrThrow, request } from './httpClient';
import { parseUser } from './parsers';

export const liveApi: WhatsUpApi = {
  mode: 'live',

  auth: {
    async me() {
      return parseOrThrow(await request('GET', '/api/auth/me'), parseUser);
    },
    async login(username, password) {
      const data = await request('POST', '/api/auth/login', { json: { username, password } });
      return parseOrThrow(data, parseUser);
    },
    async logout() {
      await request('POST', '/api/auth/logout');
    },
  },
};
