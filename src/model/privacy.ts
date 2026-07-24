import { scanPrivacy } from "../contracts/index.js";

const SENSITIVE_STRING_PATTERNS: RegExp[] = [
  /(?:^|[?&\s])(?:api[_-]?key|access[_-]?token|token|secret|password|authorization)\s*[=:]\s*[^&\s]{6,}/i,
  /\bbearer\s+[a-z0-9._~+/-]{8,}/i,
  /\bsk-[a-z0-9_-]{8,}/i,
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
  /\b1[3-9]\d{9}\b/,
  /\b\d{17}[\dXx]\b/,
  /(?:账户|账号|account(?:_number)?)\s*[=:：]\s*[a-z0-9-]{6,}/i,
  /"(?:snapshot_id|size_basis|constraints|account_number)"\s*:/i,
];

function containsSensitiveString(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === "string") {
    return SENSITIVE_STRING_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveString(item, seen));
  }
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((item) => containsSensitiveString(item, seen));
}

export function hasPrivatePayload(value: unknown): boolean {
  return scanPrivacy(value).length > 0 || containsSensitiveString(value);
}
