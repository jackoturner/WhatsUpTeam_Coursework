import { REPORT_REASON_LABELS } from '../types/api';
import type { ReportableMessage, WhatsUpApi } from '../types/api';
import { parseOrThrow, request } from './httpClient';
import {
  listOf,
  parseAuditEvent,
  parseChatMessage,
  parseConversation,
  parseReport,
  parseReportable,
  parseUser,
} from './parsers';

const REPORT_MAX_LENGTH = 500;

async function ensureCsrfToken(): Promise<void> {
  await request('GET', '/api/auth/csrf');
}

function id(value: number): string {
  return encodeURIComponent(String(value));
}

export const liveApi: WhatsUpApi = {
  chats: {
    async listConversations() {
      return parseOrThrow(
        await request('GET', '/api/conversations'),
        listOf('conversations', parseConversation),
      );
    },
    async listMessages(conversationId) {
      return parseOrThrow(
        await request('GET', `/api/conversations/${id(conversationId)}/messages?limit=50`),
        listOf('messages', parseChatMessage),
      );
    },
    async send(conversationId, body) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('POST', `/api/conversations/${id(conversationId)}/messages`, { json: { body } }),
        parseChatMessage,
      );
    },
  },

  reports: {
    async reportable(messageId) {
      return parseOrThrow(await request('GET', `/api/messages/${id(messageId)}`), parseReportable);
    },
    async submit({ messageId, reason, details }) {
      // The contract carries one free-text reason: the category label, then the details.
      const label = REPORT_REASON_LABELS[reason];
      const text = details.length > 0 ? `${label}: ${details}` : label;
      await ensureCsrfToken();
      await request('POST', `/api/messages/${id(messageId)}/reports`, {
        json: { reason: text.slice(0, REPORT_MAX_LENGTH) },
      });
    },
  },

  admin: {
    async listReports() {
      return parseOrThrow(await request('GET', '/api/admin/reports?limit=100'), listOf('reports', parseReport));
    },
    async listAuditEvents() {
      return parseOrThrow(
        await request('GET', '/api/admin/audit-events?limit=100'),
        listOf('events', parseAuditEvent),
      );
    },
  },

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
