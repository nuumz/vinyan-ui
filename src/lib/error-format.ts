import { ApiError } from './api-client';

export type ErrorKind = 'auth' | 'network' | 'timeout' | 'server' | 'notfound' | 'validation' | 'rate' | 'client' | 'unknown';

export interface FormattedError {
  /** Short human-readable title (no status codes, no paths). */
  title: string;
  /** Optional supporting hint — what to do next. */
  hint?: string;
  /** Technical details (status / path / raw body) for the collapsible row. */
  detail?: string;
  /** Bucket used to pick icon and tone. */
  kind: ErrorKind;
  /** True when the same call is worth retrying (5xx, 408, 429, network/timeout). */
  retriable: boolean;
}

const RAW_API_PREFIX = /^API\s+\d+/;
const TIMEOUT_PREFIX = /^Request timeout after/i;

function classify(err: unknown): ErrorKind {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return 'auth';
    if (err.status === 404) return 'notfound';
    if (err.status === 408) return 'timeout';
    if (err.status === 429) return 'rate';
    if (err.status === 422 || err.status === 400) return 'validation';
    if (err.status >= 500) return 'server';
    if (err.status >= 400) return 'client';
  }
  if (err instanceof Error) {
    if (TIMEOUT_PREFIX.test(err.message)) return 'timeout';
    if (/network|failed to fetch|load failed/i.test(err.message)) return 'network';
  }
  return 'unknown';
}

function defaultTitle(kind: ErrorKind): string {
  switch (kind) {
    case 'auth': return 'Authentication required';
    case 'network': return 'Backend unreachable';
    case 'timeout': return 'Request timed out';
    case 'server': return 'Backend error';
    case 'notfound': return 'Not found';
    case 'validation': return 'Invalid request';
    case 'rate': return 'Rate limited';
    case 'client': return 'Request rejected';
    default: return 'Something went wrong';
  }
}

function defaultHint(kind: ErrorKind): string | undefined {
  switch (kind) {
    case 'auth': return 'Token may have expired — refresh the page to re-authenticate.';
    case 'network': return 'Check that the backend is running on :3927 and reachable.';
    case 'timeout': return 'The request took longer than expected. Try again.';
    case 'server': return 'The backend returned an error — check server logs for details.';
    case 'rate': return 'Too many requests. Wait a moment and try again.';
    case 'validation': return 'The request payload was rejected. Check the values you submitted.';
    case 'notfound': return 'The resource was not found or has been removed.';
    default: return undefined;
  }
}

/**
 * Strip the `API <status> <statusText> <path> — <body>` envelope that
 * `fetchJSON` wraps around server responses. The raw message is fine
 * for logs but ugly in a toast. If the body looks like JSON with a
 * `message` / `error` field, prefer that.
 */
function cleanMessage(raw: string, body?: string): string {
  if (body) {
    const trimmed = body.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const candidate = (parsed.message ?? parsed.error ?? parsed.detail) as string | undefined;
        if (candidate && typeof candidate === 'string') return candidate;
      } catch {
        /* fall through */
      }
    }
    if (!trimmed.startsWith('<') && trimmed.length < 200) return trimmed;
  }
  // Drop the raw API envelope but keep any trailing prose after `—`.
  if (RAW_API_PREFIX.test(raw)) {
    const idx = raw.indexOf('—');
    if (idx > 0) {
      const tail = raw.slice(idx + 1).trim();
      if (tail && !tail.startsWith('<')) return tail;
    }
  }
  if (TIMEOUT_PREFIX.test(raw)) return 'Request timed out';
  return raw;
}

export function formatError(err: unknown, fallback = 'Unknown error'): FormattedError {
  const kind = classify(err);
  const retriable =
    kind === 'network' ||
    kind === 'timeout' ||
    kind === 'server' ||
    kind === 'rate' ||
    (err instanceof ApiError && err.status === 408);

  if (err instanceof ApiError) {
    const title = cleanMessage(err.message, err.body) || defaultTitle(kind);
    const detail = `${err.status} ${err.path}`;
    return {
      title: title === err.message ? defaultTitle(kind) : title,
      hint: defaultHint(kind),
      detail,
      kind,
      retriable,
    };
  }

  if (err instanceof Error) {
    const cleaned = cleanMessage(err.message);
    return {
      title: cleaned || defaultTitle(kind),
      hint: defaultHint(kind),
      detail: cleaned !== err.message ? err.message : undefined,
      kind,
      retriable,
    };
  }

  if (typeof err === 'string') {
    return { title: err, kind, retriable: false };
  }

  return { title: fallback, kind, retriable: false };
}

/** Quick path for places that just want a clean string (e.g. toast fallback). */
export function formatErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  return formatError(err, fallback).title;
}
