/**
 * Single source of truth for Vinyan core-loop phase ordering and labels.
 *
 * Mirrors the 7-phase sequence in vinyan-agent/src/orchestrator/core-loop.ts
 * (Perceive → Comprehend → Predict → Plan → Generate → Verify → Learn).
 *
 * Used by the chat streaming UI to render a compact phase timeline.
 */
import { Brain, Eye, GraduationCap, ListTree, ShieldCheck, Sparkles, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type PhaseName =
  | 'perceive'
  | 'comprehend'
  | 'predict'
  | 'plan'
  | 'generate'
  | 'verify'
  | 'learn';

export const PHASE_ORDER: readonly PhaseName[] = [
  'perceive',
  'comprehend',
  'predict',
  'plan',
  'generate',
  'verify',
  'learn',
] as const;

interface PhaseMeta {
  /** Full label, e.g. "Perceiving". */
  label: string;
  /** Compact 1–3 letter abbrev shown inside the pill. */
  abbrev: string;
  /** Lucide icon for verbose contexts (PhaseChip etc.). */
  Icon: LucideIcon;
  /** Tailwind text-color utility class for active/done state. */
  tone: string;
}

export const PHASE_META: Record<PhaseName, PhaseMeta> = {
  perceive: { label: 'Perceiving', abbrev: 'Pe', Icon: Eye, tone: 'text-accent' },
  comprehend: { label: 'Comprehending', abbrev: 'Co', Icon: Brain, tone: 'text-purple' },
  predict: { label: 'Predicting', abbrev: 'Pr', Icon: Target, tone: 'text-accent' },
  plan: { label: 'Planning', abbrev: 'Pl', Icon: ListTree, tone: 'text-yellow' },
  generate: { label: 'Generating', abbrev: 'Ge', Icon: Sparkles, tone: 'text-green' },
  verify: { label: 'Verifying', abbrev: 'Ve', Icon: ShieldCheck, tone: 'text-accent' },
  learn: { label: 'Learning', abbrev: 'Le', Icon: GraduationCap, tone: 'text-purple' },
};
