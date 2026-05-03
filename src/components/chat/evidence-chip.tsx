/**
 * EvidenceChip — file-evidence pill for the audit view.
 *
 * Renders a clickable chip carrying a workspace-relative path and the
 * sha256 captured at observation time. On click, hits
 * `/api/v1/files/check-hash` to see whether the file's current content
 * still matches; if it doesn't, the chip flips to an "evidence stale"
 * state so the reviewer never silently sees the rewritten file.
 *
 * Why a server round-trip: the canonical hash function lives in
 * `src/gate/content-hash-verifier.ts`, the workspace boundary check is
 * server-side, and the file content is on the server's disk. Doing this
 * client-side would require streaming the file into the browser just to
 * re-hash it.
 */
import { useState } from 'react';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

type CheckState = 'idle' | 'checking' | 'fresh' | 'stale' | 'missing' | 'error';

interface EvidenceChipProps {
  path: string;
  sha256: string;
  className?: string;
}

export function EvidenceChip({ path, sha256, className }: EvidenceChipProps) {
  const [state, setState] = useState<CheckState>('idle');
  const [actual, setActual] = useState<string | null>(null);

  async function onClick() {
    if (state === 'checking') return;
    setState('checking');
    try {
      const result = await api.checkFileHash(path, sha256);
      setActual(result.actual);
      if (result.missing) setState('missing');
      else if (result.match) setState('fresh');
      else setState('stale');
    } catch {
      setState('error');
    }
  }

  const tone = STATE_TONE[state];
  const label = STATE_LABEL[state];

  return (
    <button
      type="button"
      onClick={onClick}
      title={describeTooltip(state, sha256, actual)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-2xs transition-colors',
        tone,
        className,
      )}
      aria-pressed={state !== 'idle'}
    >
      <span className="max-w-[14rem] truncate">{path}</span>
      <span className="text-text-muted/80">{sha256.slice(0, 8)}</span>
      {state !== 'idle' && <span className="ml-1 text-2xs">{label}</span>}
    </button>
  );
}

const STATE_TONE: Record<CheckState, string> = {
  idle: 'border-border/40 bg-bg/20 text-text hover:border-border hover:bg-bg/30',
  checking: 'border-blue/30 bg-blue/5 text-blue',
  fresh: 'border-green/30 bg-green/5 text-green',
  stale: 'border-yellow/30 bg-yellow/10 text-yellow',
  missing: 'border-red/30 bg-red/10 text-red',
  error: 'border-red/30 bg-red/5 text-red',
};

const STATE_LABEL: Record<CheckState, string> = {
  idle: '',
  checking: 'checking…',
  fresh: 'fresh',
  stale: 'stale',
  missing: 'missing',
  error: 'check failed',
};

function describeTooltip(state: CheckState, expected: string, actual: string | null): string {
  if (state === 'idle') return 'Click to verify file hash against disk';
  if (state === 'fresh') return `Match — current sha256 matches the recorded ${expected.slice(0, 12)}…`;
  if (state === 'stale') return `Drift — recorded ${expected.slice(0, 12)}…, on disk ${(actual ?? '?').slice(0, 12)}…`;
  if (state === 'missing') return 'File missing on disk';
  if (state === 'error') return 'Hash check failed (network or auth)';
  return 'Verifying…';
}
