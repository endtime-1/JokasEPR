"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGEX_PATTERNS = exports.VALIDATION_LIMITS = void 0;
exports.normalizeCode = normalizeCode;
exports.assertNever = assertNever;
exports.VALIDATION_LIMITS = {
    CODE_MAX_LENGTH: 24,
    NAME_MAX_LENGTH: 120,
    DESCRIPTION_MAX_LENGTH: 240,
    PASSWORD_MIN_LENGTH: 10,
    UPLOAD_MAX_MB_DEFAULT: 10
};
exports.REGEX_PATTERNS = {
    CODE: /^[A-Z0-9][A-Z0-9-]{1,23}$/,
    PHONE_GHANA: /^(\+233|0)[0-9]{9}$/
};
function normalizeCode(value) {
    return value.trim().toUpperCase().replace(/\s+/g, "-");
}
function assertNever(value) {
    throw new Error(`Unhandled value: ${String(value)}`);
}
