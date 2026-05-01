/**
 * `deriveActionableGates` decides which gates the historical process
 * card surfaces as live actions vs read-only snapshots. The historical
 * card is normally a frozen replay, but when the backend projection
 * reports a gate is still open (`open: true && resolved: false`), the
 * user should be able to approve / answer / decide directly from the
 * /tasks drawer Process tab without bouncing back to the chat.
 *
 * These tests pin the open-and-not-resolved invariant and the
 * defensive empty-set behavior — without them a regression that flips
 * the predicate would silently strand users on a "Read-only — no
 * decision recorded" banner for an actually-actionable approval.
 *
 * Run: bun test src/components/chat/historical-process-card.test.ts
 */
import { describe, expect, test } from 'bun:test';
import type { TaskProcessGate, TaskProcessGates } from '@/lib/api-client';
import { deriveActionableGates } from './historical-process-card';

const closedResolvedGate: TaskProcessGate = { open: false, resolved: true };
const openUnresolvedGate: TaskProcessGate = { open: true, resolved: false };
const openResolvedGate: TaskProcessGate = { open: true, resolved: true };
const closedUnresolvedGate: TaskProcessGate = { open: false, resolved: false };

function gates(overrides: Partial<TaskProcessGates>): TaskProcessGates {
  return {
    approval: closedResolvedGate,
    workflowHumanInput: closedResolvedGate,
    partialDecision: closedResolvedGate,
    codingCliApproval: closedResolvedGate,
    ...overrides,
  };
}

describe('deriveActionableGates', () => {
  test('returns empty set when projection gates is null/undefined', () => {
    expect(Array.from(deriveActionableGates(null))).toEqual([]);
    expect(Array.from(deriveActionableGates(undefined))).toEqual([]);
  });

  test('returns empty set when every gate is closed/resolved (terminal task)', () => {
    expect(Array.from(deriveActionableGates(gates({})))).toEqual([]);
  });

  test('flags `approval` when the workflow approval gate is open and unresolved', () => {
    const set = deriveActionableGates(gates({ approval: openUnresolvedGate }));
    expect(set.has('approval')).toBe(true);
    expect(set.has('humanInput')).toBe(false);
    expect(set.has('partialDecision')).toBe(false);
  });

  test('flags `humanInput` when the workflow human-input gate is open and unresolved', () => {
    const set = deriveActionableGates(gates({ workflowHumanInput: openUnresolvedGate }));
    expect(set.has('humanInput')).toBe(true);
    expect(set.has('approval')).toBe(false);
  });

  test('flags `partialDecision` when the partial-failure gate is open and unresolved', () => {
    const set = deriveActionableGates(gates({ partialDecision: openUnresolvedGate }));
    expect(set.has('partialDecision')).toBe(true);
  });

  test('does NOT flag a gate that opened then resolved (decision recorded)', () => {
    // open=true + resolved=true means the gate was hit and a decision
    // exists — replaying the historical view should NOT re-prompt.
    const set = deriveActionableGates(gates({ approval: openResolvedGate }));
    expect(set.has('approval')).toBe(false);
  });

  test('does NOT flag a gate that never opened in this run', () => {
    const set = deriveActionableGates(gates({ approval: closedUnresolvedGate }));
    expect(set.has('approval')).toBe(false);
  });

  test('flags multiple simultaneously-open gates (rare but legal)', () => {
    const set = deriveActionableGates(
      gates({
        approval: openUnresolvedGate,
        workflowHumanInput: openUnresolvedGate,
      }),
    );
    expect(set.has('approval')).toBe(true);
    expect(set.has('humanInput')).toBe(true);
    expect(set.has('partialDecision')).toBe(false);
  });

  test('codingCliApproval is NOT mapped (separate UI surface)', () => {
    // Coding-CLI approvals have their own card in the chat; the
    // historical surface treats them as out-of-scope to avoid
    // duplicating the live coding-cli flow.
    const set = deriveActionableGates(gates({ codingCliApproval: openUnresolvedGate }));
    expect(set.size).toBe(0);
  });
});
