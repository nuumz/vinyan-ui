/**
 * SessionCard — single chrome primitive for every chat-surface card.
 *
 * Replaces the 21+ ad-hoc `rounded-md border` and 18+ `rounded border`
 * sites previously inlined across `final-answer`, `diagnostics-drawer`,
 * `stage-manifest-surface`, `plan-surface`, `agent-timeline-card`,
 * `action-card`, `replay-completeness-banner`, and friends.
 *
 *   variant — depth/inset on the card chrome
 *     primary   : full chrome     (border-border, bg-surface)
 *     secondary : recessed drawer (border-border/40, bg-bg/20)
 *     tertiary  : inset block     (border-border/60, bg-bg/30)
 *     inset     : minimal strip   (border-border/40, bg-bg/15)
 *
 *   tone — tint that overrides border + bg-tint with a coloured palette
 *     neutral | info | warn | success | error
 *
 * Single-class output. No internal padding by default — children pick
 * their own (the chat surfaces vary widely between chip rows and
 * paragraph blocks). Use `padded` for the common 2.5-12px combo.
 */
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type SessionCardVariant = 'primary' | 'secondary' | 'tertiary' | 'inset';
export type SessionCardTone = 'neutral' | 'info' | 'warn' | 'success' | 'error';

const VARIANT_CLS: Record<SessionCardVariant, string> = {
  primary: 'border border-border bg-surface',
  secondary: 'border border-border/40 bg-bg/20',
  tertiary: 'border border-border/60 bg-bg/30',
  inset: 'border border-border/40 bg-bg/15',
};

const TONE_CLS: Record<SessionCardTone, string> = {
  neutral: '',
  info: 'border-blue/30 bg-blue/5',
  warn: 'border-yellow/30 bg-yellow/5',
  success: 'border-green/30 bg-green/5',
  error: 'border-red/30 bg-red/5',
};

export interface SessionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SessionCardVariant;
  tone?: SessionCardTone;
  /** Adds the conventional chat-surface padding (`px-3 py-2.5`). */
  padded?: boolean;
  /** Adds `overflow-hidden` (used when nested children have their own borders). */
  clipped?: boolean;
}

export const SessionCard = forwardRef<HTMLDivElement, SessionCardProps>(function SessionCard(
  { variant = 'primary', tone = 'neutral', padded, clipped, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-md',
        VARIANT_CLS[variant],
        tone !== 'neutral' && TONE_CLS[tone],
        padded && 'px-3 py-2.5',
        clipped && 'overflow-hidden',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

interface SessionCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional leading icon — pre-styled and sized by the header. */
  icon?: React.ReactNode;
  tone?: SessionCardTone;
}

const HEADER_TONE_CLS: Record<SessionCardTone, string> = {
  neutral: 'text-text-dim',
  info: 'text-blue',
  warn: 'text-yellow',
  success: 'text-green',
  error: 'text-red',
};

export function SessionCardHeader({
  icon,
  tone = 'neutral',
  className,
  children,
  ...rest
}: SessionCardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium',
        HEADER_TONE_CLS[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </div>
  );
}

interface SessionCardBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

export function SessionCardBody({ className, children, ...rest }: SessionCardBodyProps) {
  return (
    <div className={cn('text-sm space-y-2', className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * Disabled affordance chip for blocked-feature TODOs (Slice 6). Renders a
 * non-interactive button-styled element with an explicit rationale tooltip
 * and optional RFC link. Centralized so every "Blocked — pending RFC #N"
 * affordance looks identical across TaskCard / AgentRosterCard / etc.
 */
interface SessionCardAffordanceProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  reason: string;
  rfcUrl?: string;
  icon?: React.ReactNode;
}

export function SessionCardAffordance({
  label,
  reason,
  rfcUrl,
  icon,
  className,
  ...rest
}: SessionCardAffordanceProps) {
  const title = rfcUrl ? `${reason} — ${rfcUrl}` : reason;
  return (
    <div
      role="button"
      aria-disabled="true"
      title={title}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium',
        'bg-bg/40 text-text-dim border border-border/60',
        'cursor-not-allowed select-none',
        className,
      )}
      {...rest}
    >
      {icon}
      {label}
      <span className="ml-1 text-[10px] uppercase tracking-wide opacity-60">blocked</span>
    </div>
  );
}
