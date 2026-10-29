// Extract only error descriptions. Never persist the raw response or account fields.
const ERROR_FIELDS = new Set(['code', 'message', 'msg', 'error', 'err', 'errors', 'details', 'detail',
  'reason', 'title', 'description', 'errorMessage', 'error_description', 'statusMessage', 'status_message', 'cause', 'exception']);

export function errorDetails(body, key) {
  const texts = [];
  function redact(value) {
    let text = value;
    const encodings = new Set([key, encodeURIComponent(key), Buffer.from(key).toString('base64')]);
    for (const secret of encodings) if (secret) text = text.replaceAll(secret, '[redacted]');
    text = text.replace(/https?:\/\/[^\s"'<>]+/gi, '[redacted-url]')
      .replace(/(?:api[_-]?key|password|token|authorization)\s*[:=]\s*(?:Bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[redacted-credential]')
      .replace(/\b[A-Za-z0-9_+\/-]{20,}={0,2}/g, '[redacted-token]')
      .replace(/[\u0000-\u001f\u007f]/g, ' ');
    return text.slice(0, 400);
  }
  function visit(value, depth) {
    if (depth > 5 || texts.length >= 6) return;
    if (typeof value === 'string') { if (value.trim()) texts.push(redact(value)); return; }
    if (Array.isArray(value)) { for (const item of value.slice(0, 6)) visit(item, depth + 1); return; }
    if (value && typeof value === 'object') {
      for (const [field, item] of Object.entries(value)) if (ERROR_FIELDS.has(field)) visit(item, depth + 1);
    }
  }
  visit(body, 0);
  return [...new Set(texts)];
}
