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

/**
 * Friendly-up well-known backend error strings before the generic classifier
 * runs. The backend produces strings like
 *   "Task timed out after 151s (budget: 120s) at routing level L2. Try
 *    narrowing the request, or raise --max-duration ..."
 * which leak CLI / routing-internal vocabulary into the chat UI. Map them to
 * a short title + actionable hint, but keep the original string in `detail`
 * so power users can still inspect the raw message via "Show details".
 *
 * Pattern matches a literal string (or any value coerced via `String(err)`),
 * not the `Error.message` directly — `task:complete`-style failures arrive
 * as the assistant message body, not as a thrown Error.
 */
function friendlyBackendError(rawMessage: string): FormattedError | null {
  const raw = rawMessage.trim();

  // Approval window expiry — workflow gate auto-approves on timeout now, so
  // the user only sees this if a sibling client rejected. Either way it's
  // not a hard error.
  if (/^Approval timed out after \d+ms/.test(raw)) {
    return {
      title: 'Approval expired',
      hint:
        'The 10-minute approval window passed. Vinyan auto-approves on timeout — your message will continue automatically. Retry to start fresh.',
      detail: raw,
      kind: 'timeout',
      retriable: true,
    };
  }

  // Wall-clock task timeout from core-loop.ts:2602. Strip the L<n> /
  // --max-duration jargon — chat users don't have a CLI flag.
  const taskTimeout = /^Task timed out after (\d+)s/.exec(raw);
  if (taskTimeout) {
    const seconds = taskTimeout[1];
    return {
      title: 'Task took too long',
      hint: `This complex task didn't finish within ~${seconds}s. Try simplifying the request or splitting it into smaller pieces, then retry.`,
      detail: raw,
      kind: 'timeout',
      retriable: true,
    };
  }

  // LLM proxy IPC timeout — usually transient (the underlying provider was
  // slow). Retry frequently works.
  if (/^LLM proxy timeout after \d+ms/.test(raw)) {
    return {
      title: 'Model took too long',
      hint: 'The model didn\'t respond in time. Retrying often succeeds.',
      detail: raw,
      kind: 'timeout',
      retriable: true,
    };
  }

  // User-driven rejection of a workflow plan — explicit choice, not a system
  // error. Don't offer retry; offer "send a new message" instead.
  if (/^User rejected workflow plan/.test(raw)) {
    return {
      title: 'You rejected the plan',
      hint: 'Send a new message to start over with adjusted instructions.',
      detail: raw,
      kind: 'client',
      retriable: false,
    };
  }

  // Worker subprocess crash / generic worker error.
  if (/^Worker error\b/.test(raw)) {
    return {
      title: 'Worker error',
      hint: 'The worker subprocess failed. Retry usually recovers; check backend logs if it persists.',
      detail: raw,
      kind: 'server',
      retriable: true,
    };
  }

  return null;
}

export function formatError(err: unknown, fallback = 'Unknown error'): FormattedError {
  const kind = classify(err);
  const retriable =
    kind === 'network' ||
    kind === 'timeout' ||
    kind === 'server' ||
    kind === 'rate' ||
    (err instanceof ApiError && err.status === 408);

  // Try the friendly-up shortcut first for raw strings + Error.message —
  // falls through to the generic ApiError / Error / string handling below
  // when no pattern matches.
  if (typeof err === 'string') {
    const friendly = friendlyBackendError(err);
    if (friendly) return friendly;
  }
  if (err instanceof Error) {
    const friendly = friendlyBackendError(err.message);
    if (friendly) return friendly;
  }

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
