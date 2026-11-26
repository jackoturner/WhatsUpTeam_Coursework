import { ROLES } from '../types/api';
import type {
  AuditEvent,
  ChatConversation,
  ChatMessage,
  MessageReport,
  Organisation,
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

export function parseChatMessage(value: unknown): ChatMessage {
  const record = asRecord(value);
  return {
    id: readNumber(record, 'id'),
    conversation_id: readNumber(record, 'conversation_id'),
    author_name: readString(record, 'author_name'),
    body: readString(record, 'body'),
    created_at: readString(record, 'created_at'),
    is_mine: readBoolean(record, 'is_mine'),
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
  };
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

/** Parses `{ "<key>": [ ... ] }` list envelopes. */
export function listOf<T>(key: string, parseItem: (value: unknown) => T) {
  return (value: unknown): T[] => readArray(asRecord(value), key).map(parseItem);
}
