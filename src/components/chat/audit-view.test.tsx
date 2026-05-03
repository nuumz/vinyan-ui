/**
 * AuditView render tests — renders the four tabs against a synthetic
 * audit log and asserts each surface produces the expected content.
 *
 * Pattern matches `historical-process-card.test.tsx`: render to static
 * markup with `react-dom/server` (no jsdom needed), then assert against
 * the resulting HTML string. The component uses `useState`, but the
 * initial render is fully resolved by the static renderer.
 */
import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AuditEntry } from '@/lib/api-client';
import { AuditView } from './audit-view';

const FAKE_HASH = 'a'.repeat(64);

function thoughtEntry(over: Partial<Extract<AuditEntry, { kind: 'thought' }>> = {}): AuditEntry {
  return {
    id: over.id ?? 'th-1',
    taskId: 'task-1',
    ts: over.ts ?? 1000,
    schemaVersion: 1,
    policyVersion: 'audit-v1',
    actor: over.actor ?? { type: 'worker', id: 'w-1' },
    kind: 'thought',
    content: over.content ?? 'considering whether to read foo.ts',
    trigger: over.trigger ?? 'pre-tool',
  };
}

function toolCallEntry(over: Partial<Extract<AuditEntry, { kind: 'tool_call' }>> = {}): AuditEntry {
  return {
    id: over.id ?? 'tc-1',
    taskId: 'task-1',
    ts: over.ts ?? 1100,
    schemaVersion: 1,
    policyVersion: 'audit-v1',
    actor: over.actor ?? { type: 'worker', id: 'w-1' },
    kind: 'tool_call',
    lifecycle: over.lifecycle ?? 'executed',
    toolId: over.toolId ?? 'file_read',
    argsHash: over.argsHash ?? FAKE_HASH,
    latencyMs: over.latencyMs ?? 12,
  };
}

function decisionEntry(over: Partial<Extract<AuditEntry, { kind: 'decision' }>> = {}): AuditEntry {
  return {
    id: over.id ?? 'dec-1',
    taskId: 'task-1',
    ts: over.ts ?? 1200,
    schemaVersion: 1,
    policyVersion: 'audit-v1',
    actor: over.actor ?? { type: 'orchestrator' },
    kind: 'decision',
    decisionType: over.decisionType ?? 'tool_deny',
    verdict: over.verdict ?? 'denied:shell_exec',
    rationale: over.rationale ?? 'capability gate',
    ruleId: over.ruleId ?? 'contract:shell_exec:rm',
    tier: over.tier ?? 'deterministic',
  };
}

describe('AuditView', () => {
  test('renders nothing when audit log is empty', () => {
    const html = renderToStaticMarkup(React.createElement(AuditView, { auditLog: [] }));
    expect(html).toBe('');
  });

  test('reasoning tab shows thought content + actor + trigger', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [thoughtEntry({ content: 'thinking about delegation' })],
        defaultTab: 'reasoning',
      }),
    );
    expect(html).toContain('thinking about delegation');
    expect(html).toContain('worker:w-1');
    expect(html).toContain('pre-tool');
  });

  test('tool calls tab renders lifecycle, latency, and args hash prefix', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [toolCallEntry({ toolId: 'file_read', lifecycle: 'executed', latencyMs: 42 })],
        defaultTab: 'tools',
      }),
    );
    expect(html).toContain('file_read');
    expect(html).toContain('executed');
    expect(html).toContain('42ms');
    // First 10 chars of the sha256 hash should land in the table.
    expect(html).toContain('a'.repeat(10));
  });

  test('decisions tab shows verdict + rationale + ruleId for tool_deny', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [decisionEntry({ verdict: 'denied:shell_exec', ruleId: 'contract:shell_exec:rm' })],
        defaultTab: 'decisions',
      }),
    );
    expect(html).toContain('denied:shell_exec');
    expect(html).toContain('capability gate');
    expect(html).toContain('contract:shell_exec:rm');
    expect(html).toContain('tool_deny');
  });

  test('trace tab lists every audit entry id', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [thoughtEntry({ id: 'th-X' }), toolCallEntry({ id: 'tc-X' }), decisionEntry({ id: 'dec-X' })],
        defaultTab: 'trace',
      }),
    );
    expect(html).toContain('th-X');
    expect(html).toContain('tc-X');
    expect(html).toContain('dec-X');
  });

  test('empty reasoning tab surfaces unclassifiable hint when present', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [toolCallEntry()],
        defaultTab: 'reasoning',
        completenessBySection: [
          { section: 'thoughts', kind: 'unclassifiable', count: 0, reason: 'no thought-block boundaries until PR-5' },
        ],
      }),
    );
    expect(html).toContain('No reasoning entries');
    expect(html).toContain('thought-block boundaries');
  });

  test('actor labels never collapse to bare "Agent"', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [
          thoughtEntry({ actor: { type: 'worker', id: 'w-1' } }),
          decisionEntry({ actor: { type: 'orchestrator' } }),
        ],
        defaultTab: 'trace',
      }),
    );
    // Canonical actor names from agent-vocabulary, never bare 'Agent'.
    expect(html).toContain('worker');
    expect(html).toContain('orchestrator');
    expect(html).not.toContain('>Agent<');
    expect(html).not.toContain('Agent failed');
  });
});
