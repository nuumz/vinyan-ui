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

// ── Phase 3 — Hierarchy / Final / Scrubber / Provenance / Completeness ──

import type { TaskProcessByEntity, TaskProcessProvenance, TaskProcessSectionCompleteness } from '@/lib/api-client';

function finalEntry(over: Partial<Extract<AuditEntry, { kind: 'final' }>> = {}): AuditEntry {
  return {
    id: over.id ?? 'fin-1',
    taskId: 'task-1',
    ts: over.ts ?? 2000,
    schemaVersion: 2,
    policyVersion: 'audit-v1',
    actor: over.actor ?? { type: 'orchestrator' },
    kind: 'final',
    contentHash: over.contentHash ?? 'd'.repeat(64),
    contentRedactedPreview: over.contentRedactedPreview ?? 'final answer text',
    assembledFromStepIds: over.assembledFromStepIds ?? ['step1', 'step2'],
    assembledFromDelegateIds: over.assembledFromDelegateIds ?? [],
    assembledFromSubAgentIds: over.assembledFromSubAgentIds ?? ['sub-A', 'sub-B'],
  };
}

function subAgentEntry(over: Partial<Extract<AuditEntry, { kind: 'subagent' }>> = {}): AuditEntry {
  return {
    id: over.id ?? 'sa-1',
    taskId: 'task-1',
    ts: over.ts ?? 1500,
    schemaVersion: 2,
    policyVersion: 'audit-v1',
    actor: over.actor ?? { type: 'orchestrator' },
    kind: 'subagent',
    subAgentId: over.subAgentId ?? 'task-1-delegate-step1',
    phase: over.phase ?? 'spawn',
    persona: over.persona ?? 'researcher',
  };
}

const FAKE_BY_ENTITY: TaskProcessByEntity = {
  sessionId: 'sess-1',
  workflowId: 'task-1',
  taskId: 'task-1',
  subTaskIds: ['task-1-delegate-step1'],
  subAgentIds: ['task-1-delegate-step1'],
};

const FAKE_PROVENANCE: TaskProcessProvenance = {
  policyVersions: ['audit-v1', 'audit-v2'],
  modelIds: ['claude-sonnet-4-6'],
  oracleIds: ['type-oracle', 'dep-oracle'],
  promptHashes: ['abc1234567890def', 'fedcba9876543210'],
  capabilityTokenIds: ['cap-tok-A', 'cap-tok-B', 'cap-tok-C'],
};

describe('AuditView — Phase 3 Hierarchy tab', () => {
  test('renders 6-level tree with Session → Workflow → Task → Sub-Task → Agent → Sub-Agent', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [thoughtEntry(), subAgentEntry()],
        byEntity: FAKE_BY_ENTITY,
        defaultTab: 'hierarchy',
      }),
    );
    expect(html).toContain('session: sess-1');
    expect(html).toContain('workflow: task-1');
    expect(html).toContain('task: task-1');
    expect(html).toContain('sub-task: task-1-delegate-step1');
    expect(html).toContain('agent: task-1');
    // Sub-agent label shows persona name when known — never bare "Agent".
    expect(html).toContain('sub-agent: persona:researcher');
  });

  test('hierarchy tab is graceful when byEntity is missing', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [thoughtEntry()],
        defaultTab: 'hierarchy',
      }),
    );
    expect(html).toContain('Hierarchy unavailable');
  });

  test('canonical actor vocabulary — never "Agent failed" / bare "Agent"', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [subAgentEntry()],
        byEntity: FAKE_BY_ENTITY,
        defaultTab: 'hierarchy',
      }),
    );
    expect(html).not.toContain('Agent failed');
    // The tree node says "agent: task-1" (lowercase canonical) — never
    // a bare PascalCase "Agent" label.
    expect(html).not.toMatch(/>Agent</);
  });
});

describe('AuditView — Phase 3 Final tab', () => {
  test('renders kind:final preview + chips for assembling steps and sub-agents', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [finalEntry()],
        defaultTab: 'final',
      }),
    );
    expect(html).toContain('final answer text');
    // Step chips
    expect(html).toContain('step step1');
    expect(html).toContain('step step2');
    // Sub-agent chips (prefer assembledFromSubAgentIds when present)
    expect(html).toContain('sub-agent sub-A');
    expect(html).toContain('sub-agent sub-B');
    // Assembling-from header
    expect(html.toLowerCase()).toContain('assembled from:');
    // Content hash preview
    expect(html).toContain('d'.repeat(10));
  });

  test('falls back to assembledFromDelegateIds when assembledFromSubAgentIds is absent (legacy v1)', () => {
    // Construct directly so the optional `assembledFromSubAgentIds` field
    // is genuinely absent (not defaulted by the factory's `??`).
    const legacy: AuditEntry = {
      id: 'fin-legacy',
      taskId: 'task-1',
      ts: 2000,
      schemaVersion: 1,
      policyVersion: 'audit-v1',
      actor: { type: 'orchestrator' },
      kind: 'final',
      contentHash: 'd'.repeat(64),
      contentRedactedPreview: 'legacy answer',
      assembledFromStepIds: [],
      assembledFromDelegateIds: ['legacy-delegate-1'],
    };
    const html = renderToStaticMarkup(
      React.createElement(AuditView, { auditLog: [legacy], defaultTab: 'final' }),
    );
    expect(html).toContain('sub-agent legacy-delegate-1');
  });

  test('empty state when no kind:final exists', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, { auditLog: [thoughtEntry()], defaultTab: 'final' }),
    );
    expect(html).toContain('No final answer recorded yet');
  });
});

describe('AuditView — Phase 3 timeline scrubber', () => {
  test('renders one tick per audit entry', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [
          thoughtEntry({ id: 'a', ts: 100 }),
          toolCallEntry({ id: 'b', ts: 200 }),
          decisionEntry({ id: 'c', ts: 300 }),
        ],
      }),
    );
    // The scrubber renders one button per entry with a left percentage.
    // Crude check: 3 ticks → 3 instances of "left:" inline style.
    const tickMatches = html.match(/aria-label="thought at|aria-label="tool_call at|aria-label="decision at/g);
    expect(tickMatches?.length).toBe(3);
  });

  test('scrubber is hidden when audit log is empty (component returns null)', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, { auditLog: [] }),
    );
    expect(html).toBe('');
  });
});

describe('AuditView — Phase 3 provenance footer', () => {
  test('default-collapsed footer summarizes counts', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [thoughtEntry()],
        provenance: FAKE_PROVENANCE,
      }),
    );
    expect(html).toContain('1 models'); // count of modelIds
    expect(html).toContain('2 oracles');
    expect(html).toContain('capability tokens 3');
    expect(html).toContain('audit-v1');
    // Prompt hash preview (first 10 chars).
    expect(html).toContain('0xabc1234567');
  });

  test('footer omits when provenance is undefined', () => {
    const html = renderToStaticMarkup(
      React.createElement(AuditView, { auditLog: [thoughtEntry()] }),
    );
    expect(html).not.toContain('capability tokens');
  });
});

describe('AuditView — Phase 3 completeness banner', () => {
  test('renders section-named copy for partial sections (CoT incomplete: …)', () => {
    const completeness: TaskProcessSectionCompleteness[] = [
      { section: 'thoughts', kind: 'partial', count: 5, reason: '3 trailing deltas without close' },
      { section: 'toolCalls', kind: 'complete', count: 10 },
    ];
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [thoughtEntry()],
        completenessBySection: completeness,
      }),
    );
    expect(html).toContain('CoT');
    expect(html).toContain('incomplete');
    expect(html).toContain('3 trailing deltas without close');
  });

  test('renders unclassifiable copy for sections with kind:"unclassifiable"', () => {
    const completeness: TaskProcessSectionCompleteness[] = [
      { section: 'thoughts', kind: 'unclassifiable', count: 0, reason: 'no thought-block boundaries until PR-5 lands' },
    ];
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [thoughtEntry()],
        completenessBySection: completeness,
      }),
    );
    expect(html).toContain('unclassifiable');
    expect(html).toContain('thought-block boundaries');
  });

  test('omits banner entirely when every section is complete', () => {
    const completeness: TaskProcessSectionCompleteness[] = [
      { section: 'thoughts', kind: 'complete', count: 5 },
      { section: 'toolCalls', kind: 'complete', count: 10 },
    ];
    const html = renderToStaticMarkup(
      React.createElement(AuditView, {
        auditLog: [thoughtEntry()],
        completenessBySection: completeness,
      }),
    );
    // No banner copy rendered when no issues.
    expect(html).not.toContain('incomplete');
    expect(html).not.toContain('unclassifiable');
  });

  test('table-driven: banner copy names every section it surfaces', () => {
    const sections: Array<{ section: TaskProcessSectionCompleteness['section']; expectedLabel: string }> = [
      { section: 'thoughts', expectedLabel: 'CoT' },
      { section: 'toolCalls', expectedLabel: 'Tool calls' },
      { section: 'decisions', expectedLabel: 'Decisions' },
      { section: 'verdicts', expectedLabel: 'Verdicts' },
      { section: 'planSteps', expectedLabel: 'Plan steps' },
      { section: 'subTasks', expectedLabel: 'Sub-tasks' },
      { section: 'subAgents', expectedLabel: 'Sub-agents' },
      { section: 'workflowEvents', expectedLabel: 'Workflow events' },
      { section: 'sessionEvents', expectedLabel: 'Session events' },
      { section: 'gates', expectedLabel: 'Gates' },
      { section: 'finals', expectedLabel: 'Finals' },
    ];
    for (const { section, expectedLabel } of sections) {
      const html = renderToStaticMarkup(
        React.createElement(AuditView, {
          auditLog: [thoughtEntry()],
          completenessBySection: [{ section, kind: 'partial', count: 1, reason: `synth detail for ${section}` }],
        }),
      );
      expect(html).toContain(expectedLabel);
      expect(html).toContain(`synth detail for ${section}`);
    }
  });
});
