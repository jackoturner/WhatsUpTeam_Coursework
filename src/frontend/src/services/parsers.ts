import { ROLES } from '../types/api';
import type {
  AuditEvent,
  ChatConversation,
  ChatGroup,
  ChatMessage,
  Contact,
  GroupMember,
  ManagedUser,
  MessageAttachment,
  MessageReport,
  Organisation,
  OrganisationProfile,
  Page,
  ReportableMessage,
  Role,
  User,
} from '../types/api';
import {
  isRecord,
  isSafeRelativeUrl,
  readArray,
  readBoolean,
  readNullableString,
  readNumber,
  readRecord,
  readString,
} from '../utils/guards';
import type { JsonRecord } from '../utils/guards';

function asRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) {
    throw new TypeError('Expected an object.');
  }
  return value;
}

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** API links are kept only when they stay on our own origin. */
function sameOriginUrl(record: JsonRecord, key: string): string | null {
  const value = readNullableString(record, key);
  return isSafeRelativeUrl(value) ? value : null;
}

export function parseOrganisation(value: unknown): Organisation {
  const record = asRecord(value);
  return { id: readNumber(record, 'id'), name: readString(record, 'name') };
}

export function parseUser(value: unknown): User {
  const record = asRecord(value);
  const role = readString(record, 'role');
  if (!isRole(role)) {
    throw new TypeError('Unknown role.');
  }
  return {
    id: readNumber(record, 'id'),
    username: readString(record, 'username'),
    display_name: readString(record, 'display_name'),
    role,
    organisation: parseOrganisation(readRecord(record, 'organisation')),
    avatar_url: sameOriginUrl(record, 'avatar_url'),
  };
}

export function parseReportable(value: unknown): ReportableMessage {
  const record = asRecord(value);
  return {
    id: readNumber(record, 'id'),
    conversation_name: readString(record, 'conversation_name'),
    author_name: readString(record, 'author_name'),
    body: readString(record, 'body'),
    created_at: readString(record, 'created_at'),
    detected_domain: readNullableString(record, 'detected_domain'),
  };
}

export function parseConversation(value: unknown): ChatConversation {
  const record = asRecord(value);
  const kind = readString(record, 'kind');
  if (kind !== 'direct' && kind !== 'group') {
    throw new TypeError('Unknown conversation kind.');
  }
  return { id: readNumber(record, 'id'), kind, name: readString(record, 'name') };
}

export function parseContact(value: unknown): Contact {
  const record = asRecord(value);
  const role = readString(record, 'role');
  if (!isRole(role)) {
    throw new TypeError('Unknown role.');
  }
  return {
    id: readNumber(record, 'id'),
    username: readString(record, 'username'),
    display_name: readString(record, 'display_name'),
    role,
    avatar_url: sameOriginUrl(record, 'avatar_url'),
  };
}

export function parseGroupMember(value: unknown): GroupMember {
  const record = asRecord(value);
  const role = readString(record, 'role');
  if (!isRole(role)) {
    throw new TypeError('Unknown role.');
  }
  return {
    user_id: readNumber(record, 'user_id'),
    username: readString(record, 'username'),
    display_name: readString(record, 'display_name'),
    role,
  };
}

export function parseGroup(value: unknown): ChatGroup {
  const record = asRecord(value);
  return {
    id: readNumber(record, 'id'),
    name: readString(record, 'name'),
    members: readArray(record, 'members').map(parseGroupMember),
    can_manage: readBoolean(record, 'can_manage'),
  };
}

export function parseChatMessage(value: unknown): ChatMessage {
  const record = asRecord(value);
  return {
    id: readNumber(record, 'id'),
    conversation_id: readNumber(record, 'conversation_id'),
    author_name: readString(record, 'author_name'),
    body: readString(record, 'body'),
    created_at: readString(record, 'created_at'),
    is_mine: readBoolean(record, 'is_mine'),
    attachments: readArray(record, 'attachments').map(parseAttachment),
  };
}

export function parseAttachment(value: unknown): MessageAttachment {
  const record = asRecord(value);
  const downloadUrl = readNullableString(record, 'download_url');
  const previewUrl = readString(record, 'preview_url');
  const canDownload = readBoolean(record, 'can_download');
  const isConfidential = readBoolean(record, 'is_confidential');
  if (!isSafeRelativeUrl(previewUrl) || (downloadUrl !== null && !isSafeRelativeUrl(downloadUrl))) {
    throw new TypeError('Unsafe attachment URL.');
  }
  if (canDownload !== (downloadUrl !== null) || canDownload === isConfidential) {
    throw new TypeError('Invalid attachment permissions.');
  }
  return {
    id: readNumber(record, 'id'),
    filename: readString(record, 'filename'),
    content_type: readString(record, 'content_type'),
    size_bytes: readNumber(record, 'size_bytes'),
    is_confidential: isConfidential,
    created_at: readString(record, 'created_at'),
    can_download: canDownload,
    preview_url: previewUrl,
    download_url: downloadUrl,
  };
}

export function parseReport(value: unknown): MessageReport {
  const record = asRecord(value);
  return {
    id: readNumber(record, 'id'),
    message_id: readNumber(record, 'message_id'),
    conversation_name: readString(record, 'conversation_name'),
    reporter_username: readString(record, 'reporter_username'),
    reason: readString(record, 'reason'),
    message_body: readString(record, 'message_body'),
    created_at: readString(record, 'created_at'),
    review_status: readReviewStatus(record, 'review_status'),
    reviewed_by_username: readNullableString(record, 'reviewed_by_username'),
    reviewed_at: readNullableString(record, 'reviewed_at'),
  };
}

function readReviewStatus(record: JsonRecord, key: string): MessageReport['review_status'] {
  const status = readString(record, key);
  if (status !== 'open' && status !== 'in_review' && status !== 'resolved') {
    throw new TypeError('Unknown report status.');
  }
  return status;
}

export function parseAuditEvent(value: unknown): AuditEvent {
  const record = asRecord(value);
  return {
    id: readNumber(record, 'id'),
    event_type: readString(record, 'event_type'),
    actor_username: readNullableString(record, 'actor_username'),
    timestamp: readString(record, 'timestamp'),
    source_ip: readString(record, 'source_ip'),
    details: readString(record, 'details'),
  };
}

export function parseManagedUser(value: unknown): ManagedUser {
  const record = asRecord(value);
  const role = readString(record, 'role');
  if (!isRole(role)) {
    throw new TypeError('Unknown role.');
  }
  return {
    id: readNumber(record, 'id'),
    username: readString(record, 'username'),
    display_name: readString(record, 'display_name'),
    role,
    is_active: readBoolean(record, 'is_active'),
  };
}

export function parseOrganisationProfile(value: unknown): OrganisationProfile {
  const record = asRecord(value);
  return { id: readNumber(record, 'id'), name: readString(record, 'name') };
}

/** Parses `{ "<key>": [ ... ] }` list envelopes. */
export function listOf<T>(key: string, parseItem: (value: unknown) => T) {
  return (value: unknown): T[] => readArray(asRecord(value), key).map(parseItem);
}

export function pageOf<T>(key: string, parseItem: (value: unknown) => T) {
  return (value: unknown): Page<T> => {
    const record = asRecord(value);
    return {
      items: readArray(record, key).map(parseItem),
      total: readNumber(record, 'total'),
      offset: readNumber(record, 'offset'),
      limit: readNumber(record, 'limit'),
    };
  };
}
