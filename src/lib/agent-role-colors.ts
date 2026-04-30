/**
 * Monochrome token set for multi-agent surfaces. The earlier per-role
 * palette (researcher=blue, mentor=yellow, author=purple) sat too
 * loud against the rest of the app — operators preferred the original
 * minimal monochrome aesthetic, with color reserved for status, not
 * identity. Identity is carried by the agent name itself (which is
 * now always rendered alongside).
 *
 * Returns the same neutral tokens regardless of role. Kept as a function
 * (not a constant) so consumers can pass `subtask.agentRole` without
 * conditional branches, and so reintroducing a role palette later
 * touches only this file.
 */

export interface RoleColorTokens {
  /** Tailwind class for filled bar/fill (timeline). */
  bar: string;
  /** Tailwind class for borders/accents (rows, columns). */
  border: string;
  /** Tailwind class for text labels in role chips. */
  label: string;
  /** Stable key for diagnostics / test snapshots. */
  key: string;
}

const NEUTRAL: RoleColorTokens = {
  bar: 'bg-text-dim/40',
  border: 'border-border/40',
  label: 'text-text-dim',
  key: 'neutral',
};

export function roleColor(_role: string | undefined | null): RoleColorTokens {
  return NEUTRAL;
}
