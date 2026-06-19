export const VALIDATION_LIMITS = {
  CODE_MAX_LENGTH: 24,
  NAME_MAX_LENGTH: 120,
  DESCRIPTION_MAX_LENGTH: 240,
  PASSWORD_MIN_LENGTH: 10,
  UPLOAD_MAX_MB_DEFAULT: 10
} as const;

export const REGEX_PATTERNS = {
  CODE: /^[A-Z0-9][A-Z0-9-]{1,23}$/,
  PHONE_GHANA: /^(\+233|0)[0-9]{9}$/
} as const;

export function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
