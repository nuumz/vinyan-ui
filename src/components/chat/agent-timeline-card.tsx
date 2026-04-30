import { memo, useMemo, useState } from 'react';
import {
  Bot,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  Columns3,
  FileText,
  Globe,
  GitBranch,
  Hourglass,
  Loader2,
  Search,
  SkipForward,
  Terminal,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanStep, ToolCall } from '@/hooks/use-streaming-turn';
import { classifyTool, toolBadgeLabel, toolPrimaryPreview } from '@/lib/summarize-tools';
import type { ToolCategory } from '@/lib/summarize-tools';
import { Markdown } from './markdown';

/**
 * Multi-agent activity card. Lifecycle-aware surface for `delegate-sub-agent`
 * fanout. Designed to encapsulate per-agent work as a compact "step history"
 * so the card stays scannable instead of dumping each delegate's final
 * Markdown answer inline (which duplicated the PlanSurface expansion below).
 *
 * Drawer layout (per row, expanded):
 *   - sub-task id (debug)
 *   - compact event timeline: Read X / Fetched Y / Searched Z / Ran W —
 *     one row per ToolCall pinned to this delegate via the reducer's
 *     `subTaskIdIndex`-based `resolveStepId` attribution.
 *   - "View final answer" disclosure, collapsed by default. The full
 *     answer remains canonically owned by PlanSurface; this disclosure
 *     keeps the in-context audit affordance without re-dumping the wall.
 *
 * Card-level state machine (computed once per render from delegateRows):
 *   - QUEUED:   nothing has moved yet                          → 1-line chip
 *   - ACTIVE:   ≥1 running, OR mixed pending/done in flight    → full live card
 *   - COMPLETE: every row in done|failed|skipped               → audit + compare
 *
 * Edge cases preserved from the prior version:
 *   - QUEUED degradation: when every delegate is still pending the card
 *     shrinks to a single "queued · waiting on step N" chip so it doesn't
 *     mirror the PlanSurface checklist.
 *   - Unresolved placeholder header (`$step1.result`) is suppressed.
 *   - Compare side-by-side view stacks 2+ completed agents in columns,
 *     reading from `outputPreview` directly.
 */
export interface AgentTimelineCardProps {
  /** Plan steps from the parent turn. Filtered internally to delegate-sub-agent rows. */
  steps: PlanStep[];
  /**
   * All tool calls from the parent turn. The card filters by `planStepId`
   * to render each delegate's compact step history (Read X / Fetched Y /
   * Searched Z) inside the row drawer. The reducer's `resolveStepId`
   * pins each sub-agent's tool events to its delegate step via the
   * subTaskId index, so this filter is exact per delegate.
   */
  toolCalls?: ToolCall[];
  /** True while the parent turn is still running — drives live pulses. */
  isLive?: boolean;
  /**
   * Wall-clock "now" in ms. The parent ticks this on a 1s interval so
   * each WORKING row can render its own live elapsed counter
   * (`formatDuration(nowMs - step.startedAt)`) instead of a static "…"
   * placeholder. NOT a timeout countdown — this is forward elapsed
   * time scoped to each delegate's runtime, distinct from the parent
   * turn's overall timer in TurnHeader.
   */
  nowMs?: number;
}

interface StatusMeta {
  label: string;
  Icon: typeof CircleCheck;
  text: string;
  rowTint: string;
  spin?: boolean;
  pulse?: boolean;
}

function statusMeta(step: PlanStep): StatusMeta {
  const isTimeout =
    step.status === 'failed' && (step.outputPreview ?? '').toLowerCase().includes('timed out');
  if (isTimeout) {
    return { label: 'timed out', Icon: CircleAlert, text: 'text-red', rowTint: 'bg-red/[0.04]' };
  }
  switch (step.status) {
    case 'done':
      return { label: 'done', Icon: CircleCheck, text: 'text-green', rowTint: '' };
    case 'failed':
      return { label: 'failed', Icon: CircleAlert, text: 'text-red', rowTint: 'bg-red/[0.04]' };
    case 'skipped':
      return { label: 'skipped', Icon: SkipForward, text: 'text-text-dim', rowTint: '' };
    case 'running':
      return {
        label: 'working',
        Icon: Loader2,
        text: 'text-blue',
        rowTint: 'bg-blue/[0.06]',
        spin: true,
        pulse: true,
      };
    default:
      return { label: 'queued', Icon: CircleDashed, text: 'text-text-dim', rowTint: '' };
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

// `$step1.result`, `${step1.result}`, `step1.result` — any of these signal
// an unresolved planner template. Surfacing them as the goal misleads the
// reader into thinking "step1.result" is the actual question.
const PLACEHOLDER_RE = /\$?\{?\s*step\d+\.[a-z_]+\s*\}?/i;
function looksUnresolved(label: string): boolean {
  return PLACEHOLDER_RE.test(label);
}

// First non-delegate step that hasn't completed yet — typically what the
// queued delegates are waiting on. Powers the QUEUED chip's "waiting on X".
function findBlockingStep(allSteps: PlanStep[], delegateIds: Set<string>): PlanStep | null {
  for (const step of allSteps) {
    if (delegateIds.has(step.id)) break;
    if (step.status === 'pending' || step.status === 'running') return step;
  }
  return null;
}

// Lucide icon per tool family — small visual cue so the eye can scan a long
// agent step history the same way it scans an editor's "Inspecting event
// data" panel (Read / Fetch / Search / Run). Falls back to `Wrench` for any
// uncategorized MCP tool so the row still renders.
const TOOL_ICON: Record<ToolCategory, LucideIcon> = {
  read: FileText,
  edit: FileText,
  shell: Terminal,
  search: Search,
  list: FileText,
  fetch: Globe,
  memory: FileText,
  plan: FileText,
  delegate: Users,
  git: GitBranch,
  other: Wrench,
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

interface HumanizedTool {
  Icon: LucideIcon;
  verb: string;
  subject: string;
}

// Map a single ToolCall into Claude Code-style "verb + subject" — e.g.
// `Read foo.ts` / `Fetched localhost:4000/...` / `Ran tool: vinyan_search`.
// Reuses `summarize-tools` so we stay aligned with the badge/category
// vocabulary used across the rest of the chat surface.
function humanizeTool(tool: ToolCall): HumanizedTool {
  const cat = classifyTool(tool.name);
  const Icon = TOOL_ICON[cat];
  const primary = toolPrimaryPreview(tool.name, tool.args);
  switch (cat) {
    case 'read':
      return { Icon, verb: 'Read', subject: primary || tool.name };
    case 'edit':
      return { Icon, verb: 'Edited', subject: primary || tool.name };
    case 'shell':
      return { Icon, verb: 'Ran', subject: primary || tool.name };
    case 'search':
      return { Icon, verb: 'Searched for', subject: primary || tool.name };
    case 'list':
      return { Icon, verb: 'Listed', subject: primary || tool.name };
    case 'fetch':
      return { Icon, verb: 'Fetched', subject: primary || tool.name };
    case 'memory':
      return { Icon, verb: 'Memory', subject: primary || tool.name };
    case 'plan':
      return { Icon, verb: 'Updated plan', subject: primary || '' };
    case 'delegate':
      return { Icon, verb: 'Delegated', subject: primary || tool.name };
    case 'git':
      return { Icon, verb: 'Git', subject: primary || tool.name };
    default:
      return { Icon, verb: toolBadgeLabel(tool.name), subject: primary || '' };
  }
}

interface SubAgentEventRowProps {
  tool: ToolCall;
}

function SubAgentEventRow({ tool }: SubAgentEventRowProps) {
  const { Icon, verb, subject } = humanizeTool(tool);
  const statusTone =
    tool.status === 'success'
      ? 'text-green/85'
      : tool.status === 'error'
        ? 'text-red'
        : 'text-blue/85';
  return (
    <li className="flex items-center gap-2 py-0.5 text-[11px] leading-5">
      <Icon
        size={11}
        className={cn('shrink-0', statusTone, tool.status === 'running' && 'animate-pulse')}
      />
      <span className="text-text/85 truncate min-w-0">
        <span className="text-text-dim/85">{verb}</span>
        {subject ? (
          <span className="ml-1.5 font-mono text-text/90">{truncate(subject, 90)}</span>
        ) : null}
      </span>
      {tool.status === 'running' && (
        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-blue/85 font-medium">
          running
        </span>
      )}
      {tool.status !== 'running' && tool.durationMs != null && (
        <span className="ml-auto shrink-0 text-text-dim/70 font-mono tabular-nums text-[10px]">
          {tool.durationMs < 1000 ? `${tool.durationMs}ms` : `${(tool.durationMs / 1000).toFixed(1)}s`}
        </span>
      )}
    </li>
  );
}

interface FinalAnswerDisclosureProps {
  text: string;
}

// Final agent answer is canonically rendered by PlanSurface (per-step
// expansion via `stepOutputs[stepId]`). Keeping a collapsed disclosure here
// preserves the in-context "view what this agent said" affordance without
// duplicating the full Markdown wall on first sight — which was the user's
// original complaint about the multi-agent run card.
function FinalAnswerDisclosure({ text }: FinalAnswerDisclosureProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium text-text-dim hover:text-text/85"
        aria-expanded={open}
      >
        <ChevronRight
          size={9}
          className={cn('transition-transform', open && 'rotate-90')}
        />
        {open ? 'Hide answer' : 'View final answer'}
      </button>
      {open && (
        <div className="mt-1 text-text/90 max-h-72 overflow-auto border-l border-border/30 pl-2.5">
          <Markdown content={text} />
        </div>
      )}
    </div>
  );
}

interface DelegateRowProps {
  step: PlanStep;
  events: ToolCall[];
  isLive: boolean;
  defaultOpen: boolean;
  /** Wall-clock now (ms). Drives the live elapsed counter while WORKING. */
  nowMs: number;
}

function DelegateRow({ step, events, isLive, defaultOpen, nowMs }: DelegateRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = statusMeta(step);
  const Icon = meta.Icon;

  // Forward elapsed counter:
  //   - terminal status with both timestamps → final wall-clock
  //   - running on a live turn with a startedAt → live count from nowMs
  //     (parent ticks nowMs every second, so the row repaints once per
  //     second; if startedAt is in the future due to clock skew we clamp
  //     to 0ms rather than render negative)
  //   - everything else → no counter
  const duration =
    step.startedAt && step.finishedAt
      ? formatDuration(step.finishedAt - step.startedAt)
      : step.startedAt && isLive
        ? formatDuration(Math.max(0, nowMs - step.startedAt))
        : null;

  const hasFinalOutput = !!step.outputPreview && step.outputPreview.trim().length > 0;
  const hasEvents = events.length > 0;
  const expandable = hasEvents || hasFinalOutput || step.status === 'failed';

  // Latest in-flight event surfaces in the collapsed strip while the agent
  // is working — replaces the streamed-text tail so the user sees "Read
  // foo.ts" instead of a wall of unfinished prose. Falls through to the
  // most recent event regardless of status when nothing is currently
  // running, so a paused/in-between row still shows what the agent just
  // did rather than a blank strip.
  const inFlight =
    step.status === 'running' && hasEvents
      ? events.find((e) => e.status === 'running') ?? events[events.length - 1]
      : null;

  return (
    <li
      className={cn(
        'border-b border-border/15 last:border-b-0',
        meta.rowTint,
        meta.pulse && 'animate-[pulse_2.4s_ease-in-out_infinite]',
      )}
    >
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-1.5 text-left',
          expandable ? 'cursor-pointer hover:bg-bg/30' : 'cursor-default',
        )}
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
      >
        {expandable ? (
          <ChevronRight
            size={11}
            className={cn(
              'shrink-0 text-text-dim transition-transform',
              open && 'rotate-90',
            )}
          />
        ) : (
          <span className="inline-block w-[11px] shrink-0" aria-hidden />
        )}
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <Bot
            size={11}
            className={cn('text-text-dim/70', meta.spin && 'text-blue animate-spin')}
          />
          <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded border border-border/60 bg-bg/40 text-text/90 min-w-[5.25rem] text-center">
            {step.agentId ?? 'agent?'}
          </span>
        </span>
        {!open && inFlight ? (
          <span className="flex-1 text-[11px] text-text-dim/85 line-clamp-1 min-w-0">
            <span className="text-text-dim/70">{humanizeTool(inFlight).verb}</span>
            {humanizeTool(inFlight).subject && (
              <span className="ml-1.5 font-mono text-text/80">
                {truncate(humanizeTool(inFlight).subject, 70)}
              </span>
            )}
          </span>
        ) : (
          <span className="flex-1" aria-hidden />
        )}
        <span
          className={cn(
            'shrink-0 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide tabular-nums min-w-[5.5rem] justify-end',
            meta.text,
          )}
        >
          <Icon size={10} className={cn(meta.spin && 'animate-spin')} />
          <span>{meta.label}</span>
        </span>
        {duration && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums text-text-dim/70 w-[3.5rem] justify-end">
            <Clock size={9} className="opacity-70" />
            <span>{duration}</span>
          </span>
        )}
      </button>
      {open && expandable && (
        <div className="ml-7 mb-2 mr-3 border-l border-border/40 pl-3 space-y-1.5 text-xs">
          {step.subTaskId && (
            <div className="text-[10px] font-mono text-text-dim/70">sub-task: {step.subTaskId}</div>
          )}
          {hasEvents ? (
            <ol className="space-y-0">
              {events.map((tool) => (
                <SubAgentEventRow key={tool.id} tool={tool} />
              ))}
            </ol>
          ) : step.status === 'running' ? (
            <div className="italic text-text-dim text-[11px]">Waiting for first tool call…</div>
          ) : null}
          {hasFinalOutput && <FinalAnswerDisclosure text={step.outputPreview ?? ''} />}
          {step.status === 'failed' && !hasFinalOutput && (
            <div className="rounded border border-red/25 bg-red/5 p-2 text-red/90">
              [no output captured — agent {meta.label}]
            </div>
          )}
          {!hasEvents && !hasFinalOutput && step.status !== 'running' && step.status !== 'failed' && (
            <div className="italic text-text-dim">[no activity captured]</div>
          )}
        </div>
      )}
    </li>
  );
}

function CompareDrawer({ rows }: { rows: PlanStep[] }) {
  const cols = rows.filter((r) => r.outputPreview && r.outputPreview.trim().length > 0);
  if (cols.length < 2) return null;
  return (
    <div className="border-t border-border/30 bg-bg/10 p-3">
      <div className="text-[10px] uppercase tracking-wide text-text-dim font-medium mb-2">
        Side-by-side · {cols.length} agents
      </div>
      <div
        className="grid gap-3 overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(220px, 1fr))` }}
      >
        {cols.map((row) => (
          <div
            key={row.id}
            className="rounded border border-border/40 bg-bg/30 p-2 text-xs space-y-1.5 min-w-0"
          >
            <div className="flex items-center gap-1.5 pb-1 border-b border-border/30">
              <Bot size={10} className="text-text-dim/70" />
              <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded border border-border/60 bg-bg/40">
                {row.agentId ?? 'agent?'}
              </span>
              {row.startedAt && row.finishedAt && (
                <span className="ml-auto text-[10px] text-text-dim/70 font-mono tabular-nums">
                  {formatDuration(row.finishedAt - row.startedAt)}
                </span>
              )}
            </div>
            <div className="max-h-64 overflow-auto text-[11.5px] text-text/85">
              <Markdown content={row.outputPreview ?? ''} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueuedChip({ count, blocking }: { count: number; blocking: PlanStep | null }) {
  return (
    <div className="rounded-md border border-border/40 bg-bg/15 px-3 py-1.5 flex items-center gap-2 text-[11px] text-text-dim">
      <Hourglass size={11} className="text-text-dim/80 shrink-0" />
      <span>
        <span className="font-medium text-text/85">{count}</span> sub-agent
        {count === 1 ? '' : 's'} queued
      </span>
      {blocking && (
        <span className="text-text-dim/70 truncate min-w-0" title={blocking.label}>
          · waiting on{' '}
          <span className="text-text/80">
            {blocking.label.length > 60 ? `${blocking.label.slice(0, 60)}…` : blocking.label}
          </span>
        </span>
      )}
    </div>
  );
}

function AgentTimelineCardImpl({
  steps,
  toolCalls = [],
  isLive = false,
  nowMs = Date.now(),
}: AgentTimelineCardProps) {
  const delegateRows = useMemo(
    () => steps.filter((s) => s.strategy === 'delegate-sub-agent'),
    [steps],
  );

  // Group tool calls by their resolved planStepId so each delegate row
  // gets its own compact history. Reducer's `resolveStepId` pins tool
  // events to delegate steps via subTaskId, so this filter is exact for
  // delegated agents — it does NOT pick up the parent's own ad-hoc tools.
  const eventsByStep = useMemo(() => {
    const map = new Map<string, ToolCall[]>();
    for (const t of toolCalls) {
      if (!t.planStepId) continue;
      const list = map.get(t.planStepId) ?? [];
      list.push(t);
      map.set(t.planStepId, list);
    }
    return map;
  }, [toolCalls]);

  const counts = useMemo(() => {
    let pending = 0;
    let running = 0;
    let done = 0;
    let failed = 0;
    let skipped = 0;
    for (const r of delegateRows) {
      switch (r.status) {
        case 'running':
          running++;
          break;
        case 'done':
          done++;
          break;
        case 'failed':
          failed++;
          break;
        case 'skipped':
          skipped++;
          break;
        default:
          pending++;
      }
    }
    return { pending, running, done, failed, skipped, total: delegateRows.length };
  }, [delegateRows]);

  // Shared label de-dup — only when every row carries the same label AND
  // the label isn't an unresolved placeholder.
  const sharedLabel = useMemo(() => {
    if (delegateRows.length < 2) return null;
    const first = delegateRows[0]?.label ?? '';
    if (!first) return null;
    if (looksUnresolved(first)) return null;
    return delegateRows.every((r) => r.label === first) ? first : null;
  }, [delegateRows]);

  const totalDuration = useMemo(() => {
    return delegateRows.reduce((max, r) => {
      if (r.startedAt && r.finishedAt) return Math.max(max, r.finishedAt - r.startedAt);
      return max;
    }, 0);
  }, [delegateRows]);

  const [showCompare, setShowCompare] = useState(false);

  if (delegateRows.length === 0) return null;

  const allTerminal = counts.pending === 0 && counts.running === 0;
  const isQueued =
    counts.running === 0 && counts.done === 0 && counts.failed === 0 && counts.skipped === 0;

  // STATE A — queued: compact 1-line chip, no full card.
  if (isQueued) {
    const delegateIds = new Set(delegateRows.map((r) => r.id));
    const blocking = findBlockingStep(steps, delegateIds);
    return <QueuedChip count={counts.total} blocking={blocking} />;
  }

  // STATE B/C — full card.
  const headerLabel = allTerminal
    ? counts.failed > 0
      ? `Multi-agent complete · ${counts.done} done · ${counts.failed} failed`
      : `Multi-agent complete · ${counts.done} done`
    : `Multi-agent run · ${counts.running} working`;

  const completedRowsForCompare = delegateRows.filter(
    (r) => r.status === 'done' && r.outputPreview && r.outputPreview.trim().length > 0,
  );

  return (
    <div
      className={cn(
        'rounded-md border overflow-hidden',
        isLive && counts.running > 0
          ? 'border-blue/25 bg-blue/[0.025]'
          : 'border-border/50 bg-bg/20',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30 bg-bg/20">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium text-text-dim min-w-0">
          {isLive && counts.running > 0 ? (
            <Zap size={11} className="text-blue animate-pulse shrink-0" />
          ) : (
            <Users size={11} className="text-text-dim/80 shrink-0" />
          )}
          <span className="normal-case text-text/80 truncate">{headerLabel}</span>
        </span>
        <span className="font-mono text-[10px] inline-flex items-center gap-2 normal-case tabular-nums shrink-0">
          {counts.pending > 0 && <span className="text-text-dim/80">{counts.pending} queued</span>}
          {counts.running > 0 && !allTerminal && (
            <span className="text-blue/85">{counts.running} working</span>
          )}
          {counts.done > 0 && <span className="text-green/85">{counts.done} done</span>}
          {counts.failed > 0 && <span className="text-red/85">{counts.failed} failed</span>}
          {counts.skipped > 0 && (
            <span className="text-text-dim/80">{counts.skipped} skipped</span>
          )}
          {allTerminal && totalDuration > 0 && (
            <span className="text-text-dim/70 inline-flex items-center gap-0.5">
              <Clock size={9} className="opacity-70" />
              {formatDuration(totalDuration)}
            </span>
          )}
        </span>
      </div>

      {sharedLabel && (
        <div className="px-3 pt-2 pb-1.5 text-[11.5px] text-text/85 line-clamp-2 border-b border-border/20">
          {sharedLabel}
        </div>
      )}

      <ul>
        {delegateRows.map((row) => (
          <DelegateRow
            key={row.id}
            step={row}
            events={eventsByStep.get(row.id) ?? []}
            isLive={isLive}
            defaultOpen={row.status === 'failed'}
            nowMs={nowMs}
          />
        ))}
      </ul>

      {isLive && counts.running > 0 && (
        <div className="px-3 py-1.5 border-t border-border/20 text-[10px] text-text-dim/85 italic">
          Each agent runs independently in parallel — click a row to read what they're writing live.
        </div>
      )}

      {allTerminal && completedRowsForCompare.length >= 2 && (
        <>
          <div className="border-t border-border/20 bg-bg/10 px-3 py-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] text-text-dim italic truncate">
              Click a row to read each answer · or compare them side-by-side.
            </span>
            <button
              type="button"
              onClick={() => setShowCompare((v) => !v)}
              className="shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium text-accent hover:text-accent/80"
            >
              <Columns3 size={10} />
              {showCompare ? 'Hide compare' : 'Compare side-by-side'}
            </button>
          </div>
          {showCompare && <CompareDrawer rows={completedRowsForCompare} />}
        </>
      )}
    </div>
  );
}

export const AgentTimelineCard = memo(AgentTimelineCardImpl);
