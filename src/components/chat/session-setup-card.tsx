/**
 * Session Setup Card — Claude Code-style "Initialized session" panel.
 *
 * Shown at the top of an agent turn when the orchestrator has selected
 * an engine, decided a routing level, and produced a plan/DAG. Renders
 * a compact checklist so the user can see the agent's intent at a glance
 * before the activity stream begins.
 */
import { Cpu, Layers, Terminal } from 'lucide-react';
import type { PlanStep, StreamingTurn } from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';

const ROUTING_LABEL: Record<number, string> = {
  0: 'Reflex',
  1: 'Heuristic',
  2: 'Analytical',
  3: 'Deliberative',
};

function StepRow({ step }: { step: PlanStep }) {
  let icon: string;
  let tone: string;
  let strike = false;
  switch (step.status) {
    case 'done':
      icon = '✓';
      tone = 'text-green';
      strike = true;
      break;
    case 'running':
      icon = '◐';
      tone = 'text-accent';
      break;
    case 'failed':
      icon = '✕';
      tone = 'text-red';
      break;
    case 'skipped':
      icon = '⊘';
      tone = 'text-text-dim';
      strike = true;
      break;
    default:
      icon = '○';
      tone = 'text-text-dim';
  }
  return (
    <li className="flex items-start gap-2 text-xs leading-5">
      <span className={cn('font-mono w-4 text-center shrink-0', tone)}>{icon}</span>
      <span
        className={cn(
          'flex-1 min-w-0',
          strike ? 'line-through text-text-dim' : 'text-text',
          step.status === 'running' && 'text-text font-medium',
        )}
      >
        {step.label}
      </span>
    </li>
  );
}

export function SessionSetupCard({ turn }: { turn: StreamingTurn }) {
  const hasPlan = turn.planSteps.length > 0;
  const hasMeta = !!turn.engineId || turn.routingLevel != null;
  if (!hasPlan && !hasMeta) return null;

  const routingLabel =
    turn.routingLevel != null ? ROUTING_LABEL[turn.routingLevel] ?? `L${turn.routingLevel}` : null;

  return (
    <div className="border border-border rounded-md bg-bg/40 px-3 py-2 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] text-text-dim font-medium uppercase tracking-wide">
        <Terminal size={11} className="text-text-dim" />
        Initialized task
      </div>

      {hasMeta && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {turn.engineId && (
            <span className="inline-flex items-center gap-1 text-text-dim" title={turn.engineReason}>
              <Cpu size={10} />
              <span className="text-text font-mono">{turn.engineId}</span>
            </span>
          )}
          {routingLabel && (
            <span className="inline-flex items-center gap-1 text-text-dim">
              <Layers size={10} />
              <span className="text-text">{routingLabel}</span>
              <span className="text-text-dim">(L{turn.routingLevel})</span>
            </span>
          )}
        </div>
      )}

      {hasPlan && (
        <ul className="space-y-0.5">
          {turn.planSteps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </ul>
      )}
    </div>
  );
}
