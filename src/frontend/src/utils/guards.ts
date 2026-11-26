// Small runtime checks: every API response is untrusted until its shape is verified.

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new TypeError(`Expected "${key}" to be a string.`);
  }
  return value;
}

export function readNumber(record: JsonRecord, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Expected "${key}" to be a number.`);
  }
  return value;
}

export function readNullableString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new TypeError(`Expected "${key}" to be a string or null.`);
  }
  return value;
}

export function readRecord(record: JsonRecord, key: string): JsonRecord {
  const value = record[key];
  if (!isRecord(value)) {
    throw new TypeError(`Expected "${key}" to be an object.`);
  }
  return value;
}

/** Only same-origin relative paths are allowed as links or image sources from the API. */
export function isSafeRelativeUrl(value: string | null): value is string {
  return value !== null && value.startsWith('/') && !value.startsWith('//');
}
