import { REPORT_REASON_LABELS } from '../types/api';
import type { ReportableMessage, WhatsUpApi } from '../types/api';
import { parseOrThrow, request } from './httpClient';
import {
  listOf,
  pageOf,
  parseAuditEvent,
  parseAttachment,
  parseChatMessage,
  parseConversation,
  parseContact,
  parseGroup,
  parseManagedUser,
  parseOrganisationProfile,
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
    async startDirect(contactId) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('POST', '/api/conversations/direct', { json: { contact_id: contactId } }),
        parseConversation,
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
    async listAttachments(conversationId) {
      return parseOrThrow(
        await request('GET', `/api/conversations/${id(conversationId)}/attachments`),
        listOf('files', parseAttachment),
      );
    },
    async uploadAttachment(conversationId, file, confidential) {
      await ensureCsrfToken();
      const params = new URLSearchParams({ confidential: String(confidential) });
      return parseOrThrow(
        await request(
          'POST',
          `/api/conversations/${id(conversationId)}/attachments?${params}`,
          {
            body: file,
            contentType: 'application/octet-stream',
            headers: { 'X-File-Name': encodeURIComponent(file.name) },
          },
        ),
        parseChatMessage,
      );
    },
    async reshareAttachment(sourceConversationId, fileId, targetConversationId) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request(
          'POST',
          `/api/conversations/${id(sourceConversationId)}/attachments/${id(fileId)}/share`,
          { json: { target_conversation_id: targetConversationId } },
        ),
        parseChatMessage,
      );
    },
  },

  contacts: {
    async list() {
      return parseOrThrow(await request('GET', '/api/contacts'), listOf('contacts', parseContact));
    },
  },

  groups: {
    async list() {
      return parseOrThrow(await request('GET', '/api/groups'), listOf('groups', parseGroup));
    },
    async create(name, memberIds) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('POST', '/api/groups', { json: { name, member_ids: memberIds } }),
        parseGroup,
      );
    },
    async rename(groupId, name) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('PATCH', `/api/groups/${id(groupId)}`, { json: { name } }),
        parseGroup,
      );
    },
    async addMembers(groupId, memberIds) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('POST', `/api/groups/${id(groupId)}/members`, { json: { member_ids: memberIds } }),
        parseGroup,
      );
    },
    async removeMember(groupId, memberId) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('DELETE', `/api/groups/${id(groupId)}/members/${id(memberId)}`),
        parseGroup,
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
    async listReports({ offset, reviewStatus }) {
      const params = new URLSearchParams({ limit: '50', offset: String(offset) });
      if (reviewStatus !== 'all') params.set('review_status', reviewStatus);
      return parseOrThrow(
        await request('GET', `/api/admin/reports?${params}`),
        pageOf('reports', parseReport),
      );
    },
    async updateReport(reportId, reviewStatus) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('PATCH', `/api/admin/reports/${id(reportId)}`, {
          json: { review_status: reviewStatus },
        }),
        parseReport,
      );
    },
    async listAuditEvents({ offset }) {
      const params = new URLSearchParams({ limit: '50', offset: String(offset) });
      return parseOrThrow(
        await request('GET', `/api/admin/audit-events?${params}`),
        pageOf('events', parseAuditEvent),
      );
    },
    async listUsers() {
      return parseOrThrow(await request('GET', '/api/admin/users'), listOf('users', parseManagedUser));
    },
    async createUser({ username, displayName, password, role }) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('POST', '/api/admin/users', {
          json: { username, display_name: displayName, password, role },
        }),
        parseManagedUser,
      );
    },
    async updateUser(userId, { role, isActive }) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('PATCH', `/api/admin/users/${id(userId)}`, {
          json: { role, is_active: isActive },
        }),
        parseManagedUser,
      );
    },
    async updateOrganisation(name) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('PATCH', '/api/admin/organisation', { json: { name } }),
        parseOrganisationProfile,
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
    async updateProfile(displayName) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('PATCH', '/api/auth/profile', { json: { display_name: displayName } }),
        parseUser,
      );
    },
    async changePassword(currentPassword, newPassword) {
      await ensureCsrfToken();
      await request('POST', '/api/auth/password', {
        json: { current_password: currentPassword, new_password: newPassword },
      });
    },
    async uploadAvatar(file) {
      await ensureCsrfToken();
      return parseOrThrow(
        await request('POST', '/api/auth/avatar', {
          body: file,
          contentType: 'application/octet-stream',
          headers: { 'X-File-Name': encodeURIComponent(file.name) },
        }),
        parseUser,
      );
    },
    async removeAvatar() {
      await ensureCsrfToken();
      await request('DELETE', '/api/auth/avatar');
    },
  },
};
