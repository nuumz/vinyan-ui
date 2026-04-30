import { memo, useMemo, useState } from 'react';
import {
  Bot,
  ChevronRight,
  ChevronsUpDown,
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
import type { MultiAgentSubtaskView, PlanStep, ToolCall } from '@/hooks/use-streaming-turn';
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
  /**
   * Multi-agent subtask manifest (from the parent turn). Provides the
   * deterministic fallback label ("Agent N") and the structured failure
   * shape (errorKind + errorMessage) so failed delegate rows show useful
   * detail instead of "[no output captured — agent failed]". When
   * omitted (legacy / non-workflow turns) the card falls back to
   * `step.agentId ?? 'agent?'` for back-compat.
   */
  subtasks?: MultiAgentSubtaskView[];
  /**
   * Multi-agent group mode (competition / debate / comparison / parallel /
   * pipeline) — drives competition-only affordances such as the trophy
   * winner badge and the auto-opened CompareDrawer. Absent ⇒ all
   * competition-specific UI stays off.
   */
  groupMode?: 'parallel' | 'competition' | 'debate' | 'comparison' | 'pipeline';
  /**
   * Winning agent id from the synthesizer's structured verdict (when the
   * synthesis step emitted one). Highlights the matching DelegateRow,
   * the timeline bar, and the CompareDrawer column with a trophy badge
   * and a thicker accent border. Absent ⇒ no winner declared (legacy
   * turn, parse failed, or genuine tie). Never inferred from agent order.
   */
  winnerAgentId?: string | null;
  /** Free-text reasoning from the verdict — shown as a one-line note
   *  under the winning DelegateRow. Optional. */
  winnerReasoning?: string;
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
  /** Manifest record for this step, when the stage manifest is wired. */
  subtask?: MultiAgentSubtaskView;
  /**
   * Force the row open / closed from outside. When set, the row's local
   * disclosure state is overridden — used by the "Expand all agents" /
   * "Collapse all agents" header in historical mode. Live mode passes
   * undefined and the row owns its own state.
   */
  forceOpen?: boolean;
  /**
   * Show the manifest detail panel (objective / prompt / expectedOutput /
   * inputRefs / capabilityTags / agentRole) inside the expanded drawer.
   * Default true so live mode also gets the detail; historical mode keeps
   * it on as well. Disabled only by callers that explicitly want the
   * compact pre-manifest layout.
   */
  showManifestDetail?: boolean;
  /** True when this row is the structured winner of a competition turn —
   *  surfaces a 🏆 badge with non-color cues (border, bold) so screen
   *  readers and color-blind operators don't lose the signal. */
  isWinner?: boolean;
  /** Optional one-line reasoning from the synthesizer's verdict, surfaced
   *  inline under the winning row. */
  winnerReasoning?: string;
}

/**
 * Resolve the agent label for a delegate row. Resolution order matches the
 * stage manifest's intent:
 *   1. live `step.agentId` (set by `workflow:delegate_dispatched`)
 *   2. manifest agentName / agentId (planner-pinned + registry-resolved)
 *   3. deterministic fallback `Agent N` from the manifest
 *   4. legacy `'agent?'` only when nothing above is available
 */
function resolveAgentLabel(step: PlanStep, subtask?: MultiAgentSubtaskView): string {
  return (
    step.agentId ??
    subtask?.agentName ??
    subtask?.agentId ??
    subtask?.fallbackLabel ??
    'agent?'
  );
}

function describeErrorKind(kind: MultiAgentSubtaskView['errorKind']): string {
  switch (kind) {
    case 'provider_quota':
      return 'Provider quota exhausted';
    case 'timeout':
      return 'Timed out';
    case 'empty_response':
      return 'Empty response';
    case 'parse_error':
      return 'Output failed to parse';
    case 'contract_violation':
      return 'Contract violation';
    case 'dependency_failed':
      return 'Skipped: dependency failed';
    case 'subtask_failed':
      return 'Sub-agent failed';
    case 'unknown':
    case undefined:
    default:
      return 'Failed';
  }
}

function DelegateRow({
  step,
  events,
  isLive,
  defaultOpen,
  nowMs,
  subtask,
  forceOpen,
  showManifestDetail = true,
  isWinner = false,
  winnerReasoning,
}: DelegateRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const effectiveOpen = forceOpen ?? open;
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
  const hasManifestDetail =
    showManifestDetail &&
    !!subtask &&
    !!(
      subtask.objective ||
      subtask.prompt ||
      subtask.expectedOutput ||
      subtask.agentRole ||
      (subtask.capabilityTags && subtask.capabilityTags.length > 0) ||
      subtask.inputRefs.length > 0
    );
  const expandable =
    hasEvents || hasFinalOutput || step.status === 'failed' || hasManifestDetail;

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

  // Stable DOM id so the plan-surface "jump to agent" affordance can
  // scrollIntoView + flash this row by stepId. Falls back to subtaskId
  // when stepId is unset (legacy data) so the anchor stays unique.
  const anchorId = step.id ? `delegate-row-${step.id}` : subtask?.subtaskId
    ? `delegate-row-${subtask.subtaskId}`
    : undefined;

  return (
    <li
      id={anchorId}
      className={cn(
        'border-b border-border/15 last:border-b-0 scroll-mt-4 transition-shadow',
        meta.rowTint,
        meta.pulse && 'animate-[pulse_2.4s_ease-in-out_infinite]',
        // Winner gets a left accent + subtle background. We deliberately
        // skip per-role colors — operator feedback was that monochrome
        // reads cleaner; only competition winner earns chrome.
        isWinner && 'border-l-2 border-l-accent bg-accent/[0.04]',
        // The `delegate-row-flash` class is toggled briefly by plan-surface's
        // jump-to-agent handler. Defined in index.css so the keyframes
        // respect prefers-reduced-motion (no animation when reduced).
      )}
    >
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-1.5 text-left',
          expandable ? 'cursor-pointer hover:bg-bg/30' : 'cursor-default',
        )}
        disabled={!expandable || forceOpen !== undefined}
        aria-expanded={expandable ? effectiveOpen : undefined}
      >
        {expandable ? (
          <ChevronRight
            size={11}
            className={cn(
              'shrink-0 text-text-dim transition-transform',
              effectiveOpen && 'rotate-90',
            )}
          />
        ) : (
          <span className="inline-block w-[11px] shrink-0" aria-hidden />
        )}
        <span className="inline-flex items-center gap-1.5 shrink-0">
          {isWinner ? (
            <span aria-label="Winner" title="Winner of this competition" className="text-base leading-none">
              🏆
            </span>
          ) : (
            <Bot
              size={11}
              className={cn('text-text-dim/70', meta.spin && 'text-blue animate-spin')}
            />
          )}
          <span
            className={cn(
              'font-mono text-[10.5px] px-1.5 py-0.5 rounded border border-border/60 bg-bg/40 text-text/90 min-w-[5.25rem] text-center',
              isWinner && 'font-semibold border-accent/60 bg-accent/10 text-text',
            )}
          >
            {resolveAgentLabel(step, subtask)}
          </span>
        </span>
        {!effectiveOpen && inFlight ? (
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
      {isWinner && winnerReasoning && (
        <div className="px-3 pb-1.5 -mt-0.5 text-[11px] text-text-dim italic line-clamp-2">
          <span className="text-accent/85 font-medium not-italic mr-1">Verdict:</span>
          {winnerReasoning}
        </div>
      )}
      {effectiveOpen && expandable && (
        <div className="ml-7 mb-2 mr-3 border-l border-border/40 pl-3 space-y-1.5 text-xs">
          {step.subTaskId && (
            <div className="text-[10px] font-mono text-text-dim/70">sub-task: {step.subTaskId}</div>
          )}
          {hasManifestDetail && subtask && <SubtaskManifestPanel subtask={subtask} />}
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
            <div className="rounded border border-red/25 bg-red/5 p-2 text-red/90 space-y-1">
              <div className="text-[10.5px] uppercase tracking-wide font-medium">
                {describeErrorKind(subtask?.errorKind)}
              </div>
              {subtask?.errorMessage ? (
                <div className="text-[11px] font-mono break-words">{subtask.errorMessage}</div>
              ) : (
                <div className="text-[11px] italic">
                  Agent {resolveAgentLabel(step, subtask)} reported failure with no captured output.
                </div>
              )}
              {subtask?.partialOutputAvailable && step.outputPreview && (
                <FinalAnswerDisclosure text={step.outputPreview} />
              )}
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

/**
 * Manifest detail panel inside the expanded delegate row. Shows the
 * sub-agent's planner-given objective, prompt, expectedOutput, input
 * references, and (when the agent registry resolved them) role +
 * capability tags. Used by both live and historical mode to give
 * the user a "what was this agent actually asked to do" view that
 * predates any tool activity.
 */
function SubtaskManifestPanel({ subtask }: { subtask: MultiAgentSubtaskView }) {
  const objective = subtask.objective?.trim();
  const prompt = subtask.prompt?.trim();
  // The objective often duplicates the prompt verbatim (the planner builds
  // both from `step.description`). Skip the prompt rendering in that case
  // to keep the panel compact.
  const showPrompt = !!prompt && prompt !== objective;
  return (
    <dl className="rounded border border-border/30 bg-bg/15 px-2.5 py-1.5 space-y-1 text-[11px]">
      {objective && (
        <ManifestRow label="Objective" value={objective} />
      )}
      {showPrompt && <ManifestRow label="Prompt" value={prompt!} />}
      {subtask.expectedOutput && (
        <ManifestRow label="Expected" value={subtask.expectedOutput} />
      )}
      {subtask.inputRefs.length > 0 && (
        <ManifestRow label="Inputs" value={subtask.inputRefs.join(', ')} mono />
      )}
      {subtask.agentRole && <ManifestRow label="Role" value={subtask.agentRole} />}
      {subtask.capabilityTags && subtask.capabilityTags.length > 0 && (
        <ManifestRow label="Capabilities" value={subtask.capabilityTags.join(', ')} mono />
      )}
    </dl>
  );
}

function ManifestRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="shrink-0 w-20 text-[10px] uppercase tracking-wide text-text-dim/80">
        {label}
      </dt>
      <dd
        className={cn(
          'flex-1 min-w-0 wrap-break-word text-text/90',
          mono && 'font-mono text-[10.5px]',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function CompareDrawer({
  rows,
  subtasksByStep,
  winnerAgentId,
}: {
  rows: PlanStep[];
  subtasksByStep: Map<string, MultiAgentSubtaskView>;
  /** When set, the matching column gets a thicker accent border + 🏆 row
   *  header so the verdict reads at a glance in side-by-side mode. */
  winnerAgentId?: string | null;
}) {
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
        {cols.map((row) => {
          const subtask = subtasksByStep.get(row.id);
          const isWinner =
            !!winnerAgentId &&
            (row.agentId === winnerAgentId || subtask?.agentId === winnerAgentId);
          return (
            <div
              key={row.id}
              className={cn(
                'rounded border bg-bg/30 p-2 text-xs space-y-1.5 min-w-0',
                isWinner ? 'border-accent/60 ring-1 ring-accent/30 bg-accent/[0.04]' : 'border-border/40',
              )}
            >
              <div className="flex items-center gap-1.5 pb-1 border-b border-border/30">
                {isWinner ? (
                  <span aria-label="Winner" title="Winner">🏆</span>
                ) : (
                  <Bot size={10} className="text-text-dim/70" />
                )}
                <span
                  className={cn(
                    'font-mono text-[10.5px] px-1.5 py-0.5 rounded border bg-bg/40',
                    isWinner ? 'border-accent/60 text-text font-semibold' : 'border-border/60',
                  )}
                >
                  {resolveAgentLabel(row, subtask)}
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
          );
        })}
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
  subtasks = [],
  groupMode,
  winnerAgentId,
  winnerReasoning,
}: AgentTimelineCardProps) {
  const [forceAllOpen, setForceAllOpen] = useState<boolean | undefined>(undefined);
  const delegateRows = useMemo(
    () => steps.filter((s) => s.strategy === 'delegate-sub-agent'),
    [steps],
  );
  // stepId → subtask record from the durable manifest. Powers the
  // deterministic fallback label ("Agent N") and the structured failure
  // shape (errorKind/errorMessage) so the row never collapses to "agent?"
  // or "[no output captured — agent failed]" when the manifest is wired.
  const subtasksByStep = useMemo(() => {
    const m = new Map<string, MultiAgentSubtaskView>();
    for (const s of subtasks) m.set(s.stepId, s);
    return m;
  }, [subtasks]);

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

  // Auto-open the side-by-side compare for COMPETITION turns when the
  // payload is light enough — the comparison IS the point of competition
  // mode, so making the user click for it adds friction. Guards: ≤3 agents
  // (4-up grids cramp), every preview ≤800 chars (long answers blow vertical
  // space), and groupMode === 'competition' (debate / parallel / pipeline
  // keep click-to-open behavior).
  const competitionAutoCompare = useMemo(() => {
    if (groupMode !== 'competition') return false;
    const completed = delegateRows.filter(
      (r) => r.status === 'done' && r.outputPreview && r.outputPreview.trim().length > 0,
    );
    if (completed.length < 2 || completed.length > 3) return false;
    return completed.every((r) => (r.outputPreview ?? '').length <= 800);
  }, [groupMode, delegateRows]);
  const [showCompare, setShowCompare] = useState(competitionAutoCompare);

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
          {delegateRows.length > 1 && (
            // 2-state toggle: undefined (per-row defaults — failed/winner
            // stay open) ↔ true (force every row open). We deliberately
            // never set forceAllOpen=false because that would override
            // the smart defaults — collapse returns to per-row state
            // instead, so a failed row stays expanded after "collapse".
            <button
              type="button"
              onClick={() => setForceAllOpen((v) => (v === true ? undefined : true))}
              title={forceAllOpen === true ? 'Collapse to defaults' : 'Expand all agents'}
              aria-label={forceAllOpen === true ? 'Collapse to defaults' : 'Expand all agents'}
              aria-pressed={forceAllOpen === true}
              className={cn(
                'inline-flex items-center justify-center h-5 w-5 rounded border text-text-dim/80 hover:text-text hover:border-border transition-colors',
                forceAllOpen === true
                  ? 'border-accent/50 text-accent bg-accent/10'
                  : 'border-border/50 bg-bg/40',
              )}
            >
              <ChevronsUpDown size={11} />
            </button>
          )}
        </span>
      </div>

      {sharedLabel && (
        <div className="px-3 pt-2 pb-1.5 text-[11.5px] text-text/85 line-clamp-2 border-b border-border/20">
          {sharedLabel}
        </div>
      )}

      <ul>
        {delegateRows.map((row) => {
          const subtask = subtasksByStep.get(row.id);
          const isWinner =
            !!winnerAgentId &&
            (row.agentId === winnerAgentId || subtask?.agentId === winnerAgentId);
          return (
            <DelegateRow
              key={row.id}
              step={row}
              events={eventsByStep.get(row.id) ?? []}
              isLive={isLive}
              defaultOpen={row.status === 'failed' || isWinner}
              nowMs={nowMs}
              subtask={subtask}
              forceOpen={forceAllOpen}
              isWinner={isWinner}
              winnerReasoning={isWinner ? winnerReasoning : undefined}
            />
          );
        })}
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
          {showCompare && (
            <CompareDrawer
              rows={completedRowsForCompare}
              subtasksByStep={subtasksByStep}
              winnerAgentId={winnerAgentId ?? undefined}
            />
          )}
        </>
      )}
    </div>
  );
}

export const AgentTimelineCard = memo(AgentTimelineCardImpl);
