import { ROLES } from '../types/api';
import type { Organisation, Role, User } from '../types/api';
import {
  isRecord,
  isSafeRelativeUrl,
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
