/**
 * Generic system / action card.
 *
 * Three slots, every one optional except the metadata footer:
 *   1. Header — kind label + tone-colored alert/info icon
 *   2. Body   — Markdown content + optional bulleted list
 *   3. Footer — `<MetadataPillRow>` rendering the rigid pill row
 *               (status / role / tool / tier / latency / # seq + extras)
 *
 * Used for clarification prompts, plan-ready announcements, decision
 * gates, errors, and any other non-message orchestrator surface that
 * benefits from the same visual contract.
 *
 * `<MetadataPillRow>` is exported separately so `MessageBubble` and
 * other components can reuse the exact same pill rendering without
 * wrapping a full ActionCard.
 */
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Hash,
  HelpCircle,
  Info,
  Layers,
  ShieldCheck,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  ActionCardKind,
  ExecutionMetadata,
  ExecutionStatus,
} from '@/types/session-timeline';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';

interface KindMeta {
  Icon: LucideIcon;
  label: string;
  tone: 'info' | 'warn' | 'success' | 'error' | 'neutral';
}

const KIND_META: Record<ActionCardKind, KindMeta> = {
  clarification: { Icon: HelpCircle, label: 'Clarification needed', tone: 'warn' },
  'plan-ready': { Icon: Info, label: 'Plan ready', tone: 'info' },
  'plan-approved': { Icon: CheckCircle2, label: 'Plan approved', tone: 'success' },
  'plan-rejected': { Icon: XCircle, label: 'Plan rejected', tone: 'error' },
  decision: { Icon: AlertTriangle, label: 'Decision needed', tone: 'warn' },
  'human-input': { Icon: HelpCircle, label: 'Input needed', tone: 'warn' },
  error: { Icon: XCircle, label: 'Error', tone: 'error' },
  info: { Icon: Info, label: 'Info', tone: 'info' },
  system: { Icon: Info, label: 'System', tone: 'neutral' },
};

const TONE_BORDER: Record<KindMeta['tone'], string> = {
  info: 'border-blue/30 bg-blue/5',
  warn: 'border-yellow/30 bg-yellow/5',
  success: 'border-green/30 bg-green/5',
  error: 'border-red/30 bg-red/5',
  neutral: 'border-border bg-surface',
};

const TONE_HEADER: Record<KindMeta['tone'], string> = {
  info: 'text-blue',
  warn: 'text-yellow',
  success: 'text-green',
  error: 'text-red',
  neutral: 'text-text-dim',
};

export interface ActionCardProps {
  kind: ActionCardKind;
  /** Override the default header label (e.g. dynamic context). */
  title?: string;
  /** Markdown body. Rendered before the bullets list. */
  body?: string;
  /** Optional bulleted list (rendered as a `ul`). */
  bullets?: string[];
  /** Rigid metadata footer row. */
  metadata: ExecutionMetadata;
  className?: string;
}

export function ActionCard({
  kind,
  title,
  body,
  bullets,
  metadata,
  className,
}: ActionCardProps) {
  const meta = KIND_META[kind];
  const Icon = meta.Icon;
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2.5 text-sm space-y-2',
        TONE_BORDER[meta.tone],
        className,
      )}
    >
      <div className={cn('flex items-center gap-1.5 text-xs font-medium', TONE_HEADER[meta.tone])}>
        <Icon size={12} />
        {title ?? meta.label}
      </div>

      {(body || (bullets && bullets.length > 0)) && (
        <div className="space-y-2">
          {body && <Markdown content={body} />}
          {bullets && bullets.length > 0 && (
            <ul className="list-disc list-inside text-sm text-text-dim space-y-1">
              {bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <MetadataPillRow metadata={metadata} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared metadata pill row
// ─────────────────────────────────────────────────────────────────────

interface MetadataPillRowProps {
  metadata: ExecutionMetadata;
  className?: string;
  /** When true the row also includes secondary chips (model/tokens/oracle). */
  expanded?: boolean;
}

function statusChipClass(status: ExecutionStatus): { dot: string; chip: string } {
  switch (status) {
    case 'success':
    case 'done':
      return { dot: 'bg-green', chip: 'bg-green/10 text-green border-green/25' };
    case 'failed':
    case 'error':
      return { dot: 'bg-red', chip: 'bg-red/10 text-red border-red/25' };
    case 'running':
    case 'processing':
      return { dot: 'bg-blue', chip: 'bg-blue/10 text-blue border-blue/25' };
    case 'pending':
      return { dot: 'bg-yellow', chip: 'bg-yellow/10 text-yellow border-yellow/25' };
    case 'skipped':
      return { dot: 'bg-text-dim', chip: 'bg-text-dim/10 text-text-dim border-text-dim/25' };
    default:
      return { dot: 'bg-text-dim', chip: 'bg-text-dim/10 text-text-dim border-text-dim/25' };
  }
}

function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

/**
 * Renders the rigid pill row in this exact order:
 *   [status] [role] [tool] [tier] [latency] [# seq]
 * followed by optional `expanded` chips: [model] [tokens] [oracle].
 *
 * Missing fields are silently dropped — the row never reserves space
 * for an empty pill.
 */
export function MetadataPillRow({ metadata, className, expanded = true }: MetadataPillRowProps) {
  const statusCls = statusChipClass(metadata.status);
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 text-[11px]', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium border',
          statusCls.chip,
        )}
        title="Execution status"
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', statusCls.dot)} />
        {metadata.status}
      </span>

      {metadata.role && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/25 font-medium"
          title="Agent / role"
        >
          <User size={10} />
          {metadata.role}
        </span>
      )}

      {metadata.tool && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple/10 text-purple border border-purple/25 font-medium"
          title="Tool / action"
        >
          <Wrench size={10} />
          {metadata.tool}
        </span>
      )}

      {metadata.tier !== undefined && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg/50 text-text-dim border border-border/70"
          title="Routing tier"
        >
          <Layers size={10} />L{metadata.tier}
        </span>
      )}

      {metadata.latencyMs !== undefined && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg/50 text-text-dim border border-border/70"
          title="Latency"
        >
          <Clock size={10} />
          {formatLatency(metadata.latencyMs)}
        </span>
      )}

      {metadata.seq !== undefined && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg/50 text-text-dim border border-border/70 font-mono tabular-nums"
          title="Sequence index"
        >
          # {metadata.seq}
        </span>
      )}

      {expanded && metadata.modelUsed && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg/50 text-text-dim border border-border/70"
          title="Model"
        >
          <Cpu size={10} className="text-accent/80" />
          {metadata.modelUsed}
        </span>
      )}

      {expanded && metadata.tokens !== undefined && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg/50 text-text-dim border border-border/70"
          title="Tokens consumed"
        >
          <Hash size={10} />
          {metadata.tokens.toLocaleString()}
        </span>
      )}

      {expanded && metadata.oracleVerdicts !== undefined && metadata.oracleVerdicts > 0 && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg/50 text-text-dim border border-border/70"
          title="Oracle verdicts"
        >
          <ShieldCheck size={10} />
          {metadata.oracleVerdicts}
        </span>
      )}
    </div>
  );
}
