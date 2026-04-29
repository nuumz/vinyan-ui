import {
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  Loader2,
  PenLine,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import { EscalationBadge } from './escalation-badge';
import { StatsRow } from './stats-row';

interface TurnHeaderProps {
  turn: StreamingTurn;
  /** Wall-clock "now" in ms — drives the elapsed counter. */
  nowMs: number;
}

interface HeaderStatus {
  label: string;
  detail?: string;
  Icon: LucideIcon;
  tone: string;
  /** Pulse the icon when work is actively in progress. */
  pulse?: boolean;
}

function lastRunningTool(turn: StreamingTurn): string | null {
  const active = [...turn.toolCalls].reverse().find((tool) => tool.status === 'running');
  return active?.name ?? null;
}

function deriveStatus(turn: StreamingTurn, elapsedMs: number): HeaderStatus {
  if (turn.status === 'awaiting-approval') {
    return {
      label: 'Awaiting approval',
      detail: 'Workflow plan ready',
      Icon: ShieldQuestion,
      tone: 'text-yellow',
    };
  }
  if (turn.status === 'awaiting-human-input') {
    return {
      label: 'Awaiting your answer',
      detail: turn.pendingHumanInput?.question ?? 'Workflow paused on input step',
      Icon: ShieldQuestion,
      tone: 'text-blue',
    };
  }
  if (turn.status === 'input-required') {
    return {
      label: 'Awaiting your reply',
      detail: turn.clarifications[0],
      Icon: ShieldQuestion,
      tone: 'text-yellow',
    };
  }
  if (turn.status === 'error') {
    return {
      label: 'Failed',
      detail: turn.error,
      Icon: TriangleAlert,
      tone: 'text-red',
    };
  }
  if (turn.status === 'done') {
    // `partial` = orchestrator produced a usable answer but at least one
    // sub-step failed or was skipped. Show as warning, NOT red error —
    // dropping straight to "Failed" would contradict the visible answer.
    if (turn.resultStatus === 'partial') {
      const failedSteps = turn.planSteps.filter((s) => s.status === 'failed').length;
      const skippedSteps = turn.planSteps.filter((s) => s.status === 'skipped').length;
      const parts: string[] = [];
      if (failedSteps > 0) parts.push(`${failedSteps} step${failedSteps === 1 ? '' : 's'} failed`);
      if (skippedSteps > 0) parts.push(`${skippedSteps} skipped`);
      return {
        label: 'Done with warnings',
        detail: parts.length > 0 ? parts.join(', ') : 'partial result',
        Icon: TriangleAlert,
        tone: 'text-yellow',
      };
    }
    return {
      label: 'Done',
      detail: turn.finalContent ? `${turn.finalContent.length.toLocaleString()} chars` : undefined,
      Icon: CheckCircle2,
      tone: 'text-green',
    };
  }
  // running
  const runningStep = turn.planSteps.find((s) => s.status === 'running');
  const runningTool = lastRunningTool(turn);
  const totalSteps = turn.planSteps.length;
  const stepIndex = runningStep
    ? turn.planSteps.findIndex((s) => s.id === runningStep.id) + 1
    : 0;
  const stepLabel = totalSteps > 0 && stepIndex > 0 ? `Step ${stepIndex} of ${totalSteps}` : null;
  // Sub-stage detail wins over generic "Planning" / "Working" copy when the
  // backend has emitted a `task:stage_update`. We only consult it while no
  // step or tool is actively running — once the worker is invoking a tool,
  // the tool name is more informative than e.g. "plan:ready". We also hide
  // it on `exited` events because by then the next phase usually has its
  // own header (avoids stale "Planning · Ready" once Generate is running).
  const stageDetail = turn.currentStageDetail;
  if (
    !runningStep &&
    !runningTool &&
    stageDetail &&
    stageDetail.status !== 'exited' &&
    turn.currentPhase !== 'verify'
  ) {
    const phaseTitle = stageDetail.phase.charAt(0).toUpperCase() + stageDetail.phase.slice(1);
    const stageTitle = stageDetail.stage.replace(/-/g, ' ');
    const attemptSuffix =
      stageDetail.attempt && stageDetail.attempt > 1 ? ` · attempt ${stageDetail.attempt}` : '';
    return {
      label: `${phaseTitle} · ${stageTitle}${attemptSuffix}`,
      detail: stageDetail.reason,
      Icon: Sparkles,
      tone: 'text-accent',
      pulse: true,
    };
  }
  if (runningTool) {
    return {
      label: 'Using tool',
      // Keep the detail short — long step descriptions belong in PlanSurface,
      // not the header. "<tool> · Step 2 of 4" reads at a glance.
      detail: stepLabel ? `${runningTool} · ${stepLabel}` : runningTool,
      Icon: Wrench,
      tone: 'text-purple',
      pulse: true,
    };
  }
  if (runningStep) {
    return {
      label: stepLabel ?? 'Working on step',
      detail: undefined,
      Icon: Sparkles,
      tone: 'text-accent',
      pulse: true,
    };
  }
  if (turn.currentPhase === 'verify') {
    return {
      label: 'Verifying',
      detail: 'Checking the response',
      Icon: ShieldCheck,
      tone: 'text-accent',
      pulse: true,
    };
  }
  if (turn.finalContent.length > 0) {
    return {
      label: 'Writing',
      detail: `${turn.finalContent.length.toLocaleString()} chars streamed`,
      Icon: PenLine,
      tone: 'text-green',
      pulse: true,
    };
  }
  if (turn.thinking || turn.reasoning.length > 0) {
    return {
      label: 'Thinking',
      detail: 'Reasoning through the task',
      Icon: BrainCircuit,
      tone: 'text-purple',
      pulse: true,
    };
  }
  if (!turn.taskId) {
    return {
      label: 'Connecting',
      detail: 'Opening the stream',
      Icon: CircleDashed,
      tone: 'text-text-dim',
      pulse: true,
    };
  }
  // Quiet running state: task started but nothing concrete yet (no plan,
  // no tools, no content, no reasoning). For agentic-workflow turns this
  // window can be 10–30s while the planner LLM decomposes the goal — long
  // enough that "Working" alone reads as "stuck". Promote the label after
  // 2s so the user knows we're alive, and switch to a long-wait nudge
  // after 15s so they know it's normal for complex tasks.
  if (elapsedMs > 15_000) {
    return {
      label: 'Planning',
      detail: 'Decomposing the task — complex goals can take a moment',
      Icon: Sparkles,
      tone: 'text-accent',
      pulse: true,
    };
  }
  if (elapsedMs > 2_000) {
    return {
      label: 'Planning',
      detail: 'Decomposing the task',
      Icon: Sparkles,
      tone: 'text-accent',
      pulse: true,
    };
  }
  return {
    label: 'Starting',
    detail: 'Preparing the task',
    Icon: Loader2,
    tone: 'text-accent',
    pulse: true,
  };
}

function formatElapsed(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.floor(s - m * 60)}s`;
}

/**
 * Compact 28-px status row at the top of the streaming bubble. Replaces
 * the prior `LiveActivityStrip` + metadata row pair so "what is the agent
 * doing" lives in exactly one place. Render order is: status icon · label ·
 * detail · spacer · stats · escalation chip · contract violation chip · elapsed.
 */
export function TurnHeader({ turn, nowMs }: TurnHeaderProps) {
  const elapsed = (turn.finishedAt ?? nowMs) - turn.startedAt;
  const status = deriveStatus(turn, elapsed);
  const Icon = status.Icon;

  return (
    <div className="flex items-center gap-2 min-h-7">
      <Icon
        size={14}
        className={`shrink-0 ${status.tone} ${status.pulse ? 'animate-pulse' : ''}`}
      />
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className={`text-xs font-medium ${status.tone}`}>{status.label}</span>
        {status.detail && (
          <span className="truncate text-xs text-text-dim">{status.detail}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatsRow
          tokensConsumed={turn.tokensConsumed}
          engineId={turn.engineId}
          routingLevel={turn.routingLevel}
        />
        <EscalationBadge events={turn.escalations} />
        {turn.contractViolations && (
          <span
            title={`Contract policy: ${turn.contractViolations.policy}`}
            className="inline-flex items-center gap-1 text-[10px] h-5 px-1.5 rounded bg-red/10 text-red border border-red/30 font-mono"
          >
            <ShieldAlert size={10} />
            contract ×{turn.contractViolations.count}
          </span>
        )}
        <span className="text-[10px] text-text-dim tabular-nums">{formatElapsed(elapsed)}</span>
      </div>
    </div>
  );
}
