/**
 * Drawer needs-action resolver — pure tests.
 *
 * Pins the contract that the row-level cache is downgraded to 'none'
 * when the authoritative `pendingGates` map says the gate is closed,
 * including the coding-cli-approval branch.
 */
import { describe, expect, test } from 'bun:test';
import { resolveDrawerNeedsAction, type DrawerPendingGates } from './drawer-gate-resolution';

const allClosed: DrawerPendingGates = {
  partialDecision: false,
  humanInput: false,
  approval: false,
  codingCliApproval: false,
};

describe('resolveDrawerNeedsAction — partial-decision', () => {
  test('returns "none" when gates report partial gate is closed', () => {
    expect(resolveDrawerNeedsAction('partial-decision', allClosed)).toBe('none');
  });

  test('preserves "partial-decision" when gates report the gate is still open', () => {
    expect(
      resolveDrawerNeedsAction('partial-decision', { ...allClosed, partialDecision: true }),
    ).toBe('partial-decision');
  });
});

describe('resolveDrawerNeedsAction — workflow-human-input', () => {
  test('returns "none" when gates report human-input is closed', () => {
    expect(resolveDrawerNeedsAction('workflow-human-input', allClosed)).toBe('none');
  });

  test('preserves "workflow-human-input" when the gate is still open', () => {
    expect(
      resolveDrawerNeedsAction('workflow-human-input', { ...allClosed, humanInput: true }),
    ).toBe('workflow-human-input');
  });
});

describe('resolveDrawerNeedsAction — approval', () => {
  test('returns "none" when approval gate is closed', () => {
    expect(resolveDrawerNeedsAction('approval', allClosed)).toBe('none');
  });

  test('preserves "approval" when approval gate is still open', () => {
    expect(resolveDrawerNeedsAction('approval', { ...allClosed, approval: true })).toBe('approval');
  });
});

describe('resolveDrawerNeedsAction — coding-cli-approval (NEW gate)', () => {
  test('returns "none" when codingCliApproval gate is closed', () => {
    expect(resolveDrawerNeedsAction('coding-cli-approval', allClosed)).toBe('none');
  });

  test('preserves "coding-cli-approval" when codingCliApproval gate is still open', () => {
    expect(
      resolveDrawerNeedsAction('coding-cli-approval', { ...allClosed, codingCliApproval: true }),
    ).toBe('coding-cli-approval');
  });

  test('preserves "coding-cli-approval" when codingCliApproval is undefined (legacy backend, no info)', () => {
    // Older backends may not send the field. The resolver must NOT
    // treat "undefined" as "closed" — that would silently hide a
    // pending approval the operator still needs to act on.
    const gates: DrawerPendingGates = { partialDecision: false, humanInput: false, approval: false };
    expect(resolveDrawerNeedsAction('coding-cli-approval', gates)).toBe('coding-cli-approval');
  });
});

describe('resolveDrawerNeedsAction — pass-through', () => {
  test('returns rowType unchanged when gates are null (detail not yet loaded)', () => {
    expect(resolveDrawerNeedsAction('approval', null)).toBe('approval');
    expect(resolveDrawerNeedsAction('partial-decision', null)).toBe('partial-decision');
    expect(resolveDrawerNeedsAction('coding-cli-approval', null)).toBe('coding-cli-approval');
  });

  test('returns "stale-running", "failed", "timeout", "none" unchanged', () => {
    expect(resolveDrawerNeedsAction('stale-running', allClosed)).toBe('stale-running');
    expect(resolveDrawerNeedsAction('failed', allClosed)).toBe('failed');
    expect(resolveDrawerNeedsAction('timeout', allClosed)).toBe('timeout');
    expect(resolveDrawerNeedsAction('none', allClosed)).toBe('none');
  });
});
