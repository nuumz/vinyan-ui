import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download, ExternalLink, RefreshCw, RotateCcw, Star } from 'lucide-react';
import {
  useAgent,
  useAgents,
  useExportAgentContext,
  useResetProficiency,
} from '@/hooks/use-agents';
import { useSkills } from '@/hooks/use-skills';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { cn, timeAgo } from '@/lib/utils';
import type {
  AgentContextDetail,
  AgentEpisode,
  AgentListEntry,
  SkillCatalogItem,
} from '@/lib/api-client';

type AgentProficiency = AgentContextDetail['skills']['proficiencies'][string];

export default function Agents() {
  const agentsQuery = useAgents();
  const agents = agentsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isFetching = agentsQuery.isFetching;
  const loading = !agentsQuery.data && agentsQuery.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Agents"
        description="Specialist agents — built-in + configured. Click a row for episodes, lessons, soul."
        actions={
          <button
            type="button"
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            onClick={() => agentsQuery.refetch()}
            title="Refresh"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {agents.length === 0 ? (
            <EmptyState
              message="No agents registered"
              hint="Run 'vinyan agent create <id>' or check vinyan.json"
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Episodes</th>
                  <th className="px-4 py-2 text-right">Proficiencies</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={cn(
                      'border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors',
                      selectedId === a.id && 'bg-white/[0.02]',
                    )}
                  >
                    <td className="px-4 py-2 font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        {a.isDefault && (
                          <Star size={12} className="text-yellow fill-yellow" aria-label="default" />
                        )}
                        <span>{a.id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">{a.name}</td>
                    <td className="px-4 py-2 text-text-dim truncate max-w-[28rem]">{a.description}</td>
                    <td className="px-4 py-2">
                      <Badge variant={a.builtin ? 'info' : 'neutral'}>
                        {a.builtin ? 'built-in' : 'custom'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 tabular-nums text-right">{a.episodeCount}</td>
                    <td className="px-4 py-2 tabular-nums text-right">{a.proficiencyCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <AgentDetail
        agent={agents.find((a) => a.id === selectedId) ?? null}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

type AgentTab = 'overview' | 'memory' | 'skills' | 'soul';

function AgentDetail({ agent, onClose }: { agent: AgentListEntry | null; onClose: () => void }) {
  const detailQuery = useAgent(agent?.id ?? null);
  const [tab, setTab] = useState<AgentTab>('overview');
  const detail = detailQuery.data;
  const exportCtx = useExportAgentContext();

  const tabs: ReadonlyArray<TabItem<AgentTab>> = [
    { id: 'overview', label: 'Overview' },
    { id: 'memory', label: 'Memory', count: detail?.context?.memory.episodes.length },
    {
      id: 'skills',
      label: 'Skills',
      count: detail?.context ? Object.keys(detail.context.skills.proficiencies).length : undefined,
    },
    { id: 'soul', label: 'Soul' },
  ];

  /**
   * Trigger a JSON download of the agent's full context. The browser-side
   * Blob/anchor sequence is kept inline because the surface is tiny and
   * we want to react to the mutation result synchronously — wrapping it
   * in another hook would add indirection without value.
   */
  const handleExport = async () => {
    if (!agent) return;
    try {
      const data = await exportCtx.mutateAsync(agent.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-context-${agent.id}-${new Date(data.exportedAt).toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* toast handled by hook */
    }
  };

  return (
    <DetailDrawer
      open={agent !== null}
      onClose={onClose}
      title={agent?.name ?? ''}
      subtitle={agent?.id}
      width="xl"
    >
      {!agent ? null : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Tabs items={tabs} active={tab} onChange={setTab} className="flex-1" />
            <button
              type="button"
              onClick={handleExport}
              disabled={exportCtx.isPending || !detail?.context}
              className="px-2.5 py-1 text-xs rounded text-text-dim hover:text-text hover:bg-white/5 border border-border transition-colors flex items-center gap-1 disabled:opacity-40"
              title="Download the full AgentContext as JSON (episodes, proficiencies, lessons)."
            >
              <Download size={12} />
              {exportCtx.isPending ? 'Exporting…' : 'Export context'}
            </button>
          </div>

          {tab === 'overview' && <OverviewTab agent={agent} detail={detail} />}
          {tab === 'memory' && <MemoryTab detail={detail} />}
          {tab === 'skills' && <SkillsTab detail={detail} agentId={agent.id} />}
          {tab === 'soul' && <SoulTab detail={detail} />}
        </div>
      )}
    </DetailDrawer>
  );
}

function OverviewTab({
  agent,
  detail,
}: {
  agent: AgentListEntry;
  detail: ReturnType<typeof useAgent>['data'];
}) {
  return (
    <div className="space-y-3 text-sm">
      <DetailRow label="Description" value={agent.description} />
      <DetailRow label="Type" value={agent.builtin ? 'built-in' : 'custom'} />
      {agent.isDefault && <DetailRow label="Role" value="Default agent" />}
      {agent.specialization && <DetailRow label="Specialization" value={agent.specialization} />}
      {agent.persona && <DetailRow label="Persona" value={agent.persona} />}

      {agent.routingHints && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Routing Hints</div>
          <div className="space-y-1 text-sm">
            {agent.routingHints.minLevel !== undefined && (
              <DetailRow label="Min level" value={`L${agent.routingHints.minLevel}`} />
            )}
            {agent.routingHints.preferDomains && (
              <DetailRow label="Domains" value={agent.routingHints.preferDomains.join(', ')} />
            )}
            {agent.routingHints.preferExtensions && (
              <DetailRow label="Extensions" value={agent.routingHints.preferExtensions.join(', ')} />
            )}
            {agent.routingHints.preferFrameworks && (
              <DetailRow label="Frameworks" value={agent.routingHints.preferFrameworks.join(', ')} />
            )}
          </div>
        </div>
      )}

      {agent.allowedTools && agent.allowedTools.length > 0 && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">
            Allowed Tools ({agent.allowedTools.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {agent.allowedTools.map((t) => (
              <code key={t} className="text-xs bg-bg px-1.5 py-0.5 rounded">
                {t}
              </code>
            ))}
          </div>
        </div>
      )}

      {detail?.context?.identity && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Identity</div>
          <DetailRow label="Approach style" value={detail.context.identity.approachStyle || '—'} />
          {detail.context.identity.strengths.length > 0 && (
            <DetailRow label="Strengths" value={detail.context.identity.strengths.join(', ')} />
          )}
          {detail.context.identity.weaknesses.length > 0 && (
            <DetailRow label="Weaknesses" value={detail.context.identity.weaknesses.join(', ')} />
          )}
        </div>
      )}
    </div>
  );
}

function MemoryTab({ detail }: { detail: ReturnType<typeof useAgent>['data'] }) {
  if (!detail?.context) {
    return <div className="text-sm text-text-dim">No context recorded yet for this agent.</div>;
  }
  const { episodes, lessonsSummary } = detail.context.memory;

  return (
    <div className="space-y-4 text-sm">
      {lessonsSummary && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Lessons Summary</div>
          <div className="bg-bg rounded p-3 text-xs whitespace-pre-wrap">{lessonsSummary}</div>
        </div>
      )}

      <div>
        <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">
          Episodes ({episodes.length})
        </div>
        {episodes.length === 0 ? (
          <div className="text-text-dim text-sm">No episodes recorded yet.</div>
        ) : (
          <div className="space-y-2">
            {episodes.map((ep) => (
              <div key={ep.taskId} className="bg-bg rounded p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      ep.outcome === 'success'
                        ? 'success'
                        : ep.outcome === 'partial'
                          ? 'warning'
                          : 'error'
                    }
                  >
                    {ep.outcome}
                  </Badge>
                  <span className="font-mono text-xs text-text-dim">{ep.taskId}</span>
                  <span className="ml-auto text-xs text-text-dim">{timeAgo(ep.timestamp)}</span>
                </div>
                <div className="text-sm">{ep.lesson}</div>
                {ep.approachUsed && (
                  <div className="text-xs text-text-dim">approach: {ep.approachUsed}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Proficiency helpers ────────────────────────────────────────────

/**
 * TaskFingerprint sigs are encoded as `<actionVerb>::<framework>::<blastRadius>`.
 * `unknown::none::single` is the legitimate "no signal yet" fingerprint —
 * decoded here so operators don't have to read the wire format. Returns null
 * when the input doesn't look like a 3-part fingerprint (legacy or hand-set
 * signatures pass through verbatim).
 */
function decodeTaskFingerprint(
  sig: string,
): { verb: string; framework: string; blast: string } | null {
  const parts = sig.split('::');
  if (parts.length !== 3) return null;
  return {
    verb: parts[0] || 'unknown',
    framework: parts[1] || 'none',
    blast: parts[2] || 'single',
  };
}

const BLAST_LABELS: Record<string, string> = {
  single: 'single file',
  small: 'small (1–5 files)',
  medium: 'medium (6–25 files)',
  large: 'large (>25 files)',
};

/**
 * Wilson 95% lower bound for a binomial proportion. Used to keep small-n
 * proficiencies honest — n=1 with one success has p̂=100% but a Wilson LB of
 * ~20%, which is a more useful number for routing decisions than the raw
 * fraction. Mirrors the calculation used in skill-promotion gating, but
 * recomputed client-side from (successRate, totalAttempts).
 *
 * Returns 0 when `n <= 0` (avoids NaN).
 */
function wilsonLowerBound(successRate: number, n: number): number {
  if (n <= 0) return 0;
  const p = Math.max(0, Math.min(1, successRate));
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (center - margin) / denom);
}

function levelVariant(level: string): 'success' | 'info' | 'neutral' {
  if (level === 'expert') return 'success';
  if (level === 'competent') return 'info';
  return 'neutral';
}

// ── SkillsTab ──────────────────────────────────────────────────────

function SkillsTab({
  detail,
  agentId,
}: {
  detail: ReturnType<typeof useAgent>['data'];
  agentId: string;
}) {
  // Unified catalog filtered to this persona — covers visible simple/heavy
  // skills + cached approaches scoped to (or shared with) this agent. Used
  // both for the Visible-skills list and to cross-link proficiency rows
  // back to the cached_skill at the same taskSignature when one exists.
  const skillsQuery = useSkills({ agentId });
  const allSkills = skillsQuery.data ?? [];
  const visibleSkills = allSkills.filter((s) => s.kind === 'simple' || s.kind === 'heavy');
  const cachedBySignature = useMemo(() => {
    const m = new Map<string, SkillCatalogItem>();
    // Cached items have `name === taskSignature` (see catalog service).
    for (const s of allSkills) if (s.kind === 'cached') m.set(s.name, s);
    return m;
  }, [allSkills]);

  const proficiencies: Record<string, AgentProficiency> =
    detail?.context?.skills.proficiencies ?? {};
  const preferredApproaches = detail?.context?.skills.preferredApproaches ?? {};
  const antiPatterns: readonly string[] = detail?.context?.skills.antiPatterns ?? [];
  const lessonsSummary = detail?.context?.memory.lessonsSummary?.trim() ?? '';
  const episodes: readonly AgentEpisode[] = detail?.context?.memory.episodes ?? [];

  // Sort: most-experienced signatures first; then highest success rate; then
  // alphabetical for stable display. Operators looking at proficiencies care
  // about evidence weight before headline level.
  const sortedProfList = useMemo(
    () =>
      Object.values(proficiencies).slice().sort((a, b) => {
        if (b.totalAttempts !== a.totalAttempts) return b.totalAttempts - a.totalAttempts;
        if (b.successRate !== a.successRate) return b.successRate - a.successRate;
        return a.taskSignature.localeCompare(b.taskSignature);
      }),
    [proficiencies],
  );

  const episodesBySignature = useMemo(() => {
    const m = new Map<string, AgentEpisode[]>();
    for (const ep of episodes) {
      const arr = m.get(ep.taskSignature) ?? [];
      arr.push(ep);
      m.set(ep.taskSignature, arr);
    }
    // Keep most recent first — episodes already arrive newest-last from the
    // store, so reverse a copy to avoid mutating the source.
    for (const [k, v] of m) m.set(k, v.slice().sort((a, b) => b.timestamp - a.timestamp));
    return m;
  }, [episodes]);

  const resetProf = useResetProficiency();

  const [expandedSig, setExpandedSig] = useState<string | null>(null);

  if (!detail?.context && visibleSkills.length === 0 && !skillsQuery.isLoading) {
    return <div className="text-sm text-text-dim">No skills or context recorded yet for this agent.</div>;
  }

  // Anti-patterns that can't be associated with any proficiency signature get
  // pinned to the bottom — keep them visible without forcing every row to
  // show them.
  const orphanAntiPatterns = antiPatterns.filter(
    (a) => !sortedProfList.some((p) => a.includes(p.taskSignature)),
  );

  return (
    <div className="space-y-4 text-sm">
      {/* ── Visible skills ─────────────────────────────────────── */}
      <div>
        <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">
          Visible skills ({visibleSkills.length})
        </div>
        <div className="text-xs text-text-dim/80 mb-2">
          SKILL.md files this agent can invoke — shared scope plus its own per-agent skills. Hidden skills
          belong to other agents.
        </div>
        {skillsQuery.isLoading ? (
          <div className="text-text-dim text-xs">Loading…</div>
        ) : visibleSkills.length === 0 ? (
          <div className="text-text-dim text-xs italic">No skills visible to this agent yet.</div>
        ) : (
          <ul className="space-y-1.5">
            {visibleSkills.map((s) => (
              <AgentSkillRow key={s.id} skill={s} agentId={agentId} />
            ))}
          </ul>
        )}
      </div>

      {/* ── Lessons summary (free text) ─────────────────────────── */}
      {lessonsSummary && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">
            Lessons learned
          </div>
          <div className="bg-bg/60 border border-border/50 rounded p-3 text-sm whitespace-pre-wrap leading-relaxed">
            {lessonsSummary}
          </div>
        </div>
      )}

      {/* ── Task experience (expandable) ─────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="text-xs text-text-dim uppercase tracking-wider">
            Task experience ({sortedProfList.length})
          </div>
          <span
            className="text-[10px] text-text-dim/70"
            title="Vinyan classifies every task by a fingerprint of the form (action verb · framework · blast radius). Each row aggregates this agent's performance on tasks matching that fingerprint."
          >
            what is a fingerprint?
          </span>
        </div>
        <div className="text-xs text-text-dim/80 mb-2">
          Empirical task profile — what kinds of tasks this agent has run, with a Wilson 95% lower bound.
          Click a row to see preferred approach, recent episodes, and any cached skill for the same fingerprint.
          <span className="text-text-dim/60"> Distinct from the executable skills above.</span>
        </div>
        {sortedProfList.length === 0 ? (
          <div className="text-text-dim text-xs italic">No task experience yet — this agent hasn't run any tasks.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-dim border-b border-border/50">
                <th className="text-left pb-1.5 w-6"></th>
                <th className="text-left pb-1.5">Fingerprint</th>
                <th
                  className="text-left pb-1.5"
                  title="Empirical level derived from the Wilson lower bound. Small samples stay 'novice' regardless of streak — this is NOT skill mastery."
                >
                  Level
                </th>
                <th
                  className="text-right pb-1.5"
                  title="Headline success rate over the lower 95% Wilson bound. The Wilson LB is what worker-pool routing should rely on, not the headline rate."
                >
                  Success / Wilson LB
                </th>
                <th className="text-left pb-1.5" title="Last 10 episodes for this fingerprint, oldest → newest. Green = success, amber = partial, red = failed.">
                  Recent
                </th>
                <th className="text-right pb-1.5">Attempts</th>
                <th className="text-right pb-1.5">Last</th>
              </tr>
            </thead>
            <tbody>
              {sortedProfList.flatMap((p) => {
                const fp = decodeTaskFingerprint(p.taskSignature);
                const lb = wilsonLowerBound(p.successRate, p.totalAttempts);
                const lowData = p.totalAttempts < 5;
                const isOpen = expandedSig === p.taskSignature;
                const rows: React.ReactNode[] = [
                  <tr
                    key={`${p.taskSignature}-row`}
                    onClick={() =>
                      setExpandedSig(isOpen ? null : p.taskSignature)
                    }
                    className="border-b border-border/30 hover:bg-white/[0.02] cursor-pointer transition-colors"
                  >
                    <td className="py-1.5 align-top text-text-dim/70">
                      {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </td>
                    <td className="py-1.5 align-top">
                      {fp ? (
                        <div className="space-y-0.5">
                          <div className="font-mono text-[10px] text-text-dim">
                            {p.taskSignature}
                          </div>
                          <div className="text-text">
                            <span className="text-accent/90">{fp.verb}</span>
                            <span className="text-text-dim/60"> · </span>
                            <span>{fp.framework === 'none' ? 'no framework' : fp.framework}</span>
                            <span className="text-text-dim/60"> · </span>
                            <span>{BLAST_LABELS[fp.blast] ?? fp.blast}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono">{p.taskSignature}</span>
                      )}
                    </td>
                    <td className="py-1.5 align-top">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={levelVariant(p.level)}>{p.level}</Badge>
                        {lowData && (
                          <span
                            className="text-[10px] text-amber-400/80"
                            title="Fewer than 5 attempts — level is statistically weak"
                          >
                            low data
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 tabular-nums text-right align-top">
                      <div>{(p.successRate * 100).toFixed(0)}%</div>
                      <div className="text-[10px] text-text-dim">≥ {(lb * 100).toFixed(0)}%</div>
                    </td>
                    <td className="py-1.5 align-top">
                      <AttemptTrend episodes={episodesBySignature.get(p.taskSignature) ?? []} />
                    </td>
                    <td className="py-1.5 tabular-nums text-right align-top">{p.totalAttempts}</td>
                    <td className="py-1.5 text-right text-text-dim align-top">
                      {p.lastAttempt ? timeAgo(p.lastAttempt) : '—'}
                    </td>
                  </tr>,
                ];
                if (isOpen) {
                  rows.push(
                    <tr key={`${p.taskSignature}-detail`} className="border-b border-border/30">
                      <td colSpan={7} className="bg-bg/40 px-3 py-3">
                        <ProficiencyDetail
                          prof={p}
                          fingerprint={fp}
                          wilsonLB={lb}
                          preferredApproach={preferredApproaches[p.taskSignature] ?? null}
                          relatedAntiPatterns={antiPatterns.filter((a) =>
                            a.includes(p.taskSignature),
                          )}
                          recentEpisodes={episodesBySignature.get(p.taskSignature) ?? []}
                          cachedSkill={cachedBySignature.get(p.taskSignature) ?? null}
                          onReset={(reason) =>
                            resetProf.mutate({ agentId, signature: p.taskSignature, reason })
                          }
                          isResetting={
                            resetProf.isPending && resetProf.variables?.signature === p.taskSignature
                          }
                        />
                      </td>
                    </tr>,
                  );
                }
                return rows.map((r, i) => <Fragment key={`${p.taskSignature}-${i}`}>{r}</Fragment>);
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Orphan anti-patterns (those not tied to a proficiency signature) ── */}
      {orphanAntiPatterns.length > 0 && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">
            Anti-patterns (general)
          </div>
          <div className="text-xs text-text-dim/70 mb-1">
            Lessons that don't reference a specific task fingerprint. Signature-specific anti-patterns
            appear inside their proficiency row.
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs">
            {orphanAntiPatterns.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── ProficiencyDetail (inline expansion panel) ─────────────────────

function ProficiencyDetail({
  prof,
  fingerprint,
  wilsonLB,
  preferredApproach,
  relatedAntiPatterns,
  recentEpisodes,
  cachedSkill,
  onReset,
  isResetting,
}: {
  prof: AgentProficiency;
  fingerprint: { verb: string; framework: string; blast: string } | null;
  wilsonLB: number;
  preferredApproach: string | null;
  relatedAntiPatterns: readonly string[];
  recentEpisodes: readonly AgentEpisode[];
  cachedSkill: SkillCatalogItem | null;
  onReset: (reason: string) => void;
  isResetting: boolean;
}) {
  const successes = Math.round(prof.successRate * prof.totalAttempts);
  const failures = Math.max(0, prof.totalAttempts - successes);

  return (
    <div className="space-y-3 text-xs">
      {/* Decoded fingerprint */}
      {fingerprint && (
        <div className="grid grid-cols-3 gap-2">
          <DetailMini label="Action verb" value={fingerprint.verb} />
          <DetailMini
            label="Framework"
            value={fingerprint.framework === 'none' ? '(no specific framework)' : fingerprint.framework}
          />
          <DetailMini
            label="Blast radius"
            value={BLAST_LABELS[fingerprint.blast] ?? fingerprint.blast}
          />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <DetailMini label="Successes" value={successes.toString()} />
        <DetailMini label="Failures" value={failures.toString()} />
        <DetailMini label="Success rate" value={`${(prof.successRate * 100).toFixed(1)}%`} />
        <DetailMini
          label="Wilson 95% LB"
          value={`${(wilsonLB * 100).toFixed(1)}%`}
          hint="The lowest plausible success rate at 95% confidence — small samples have a wide gap from the headline rate."
        />
      </div>

      {/* Preferred approach for this signature */}
      {preferredApproach ? (
        <div>
          <div className="text-text-dim uppercase tracking-wider mb-1">Preferred approach</div>
          <div className="bg-bg rounded p-2 whitespace-pre-wrap">{preferredApproach}</div>
        </div>
      ) : null}

      {/* Cached skill cross-link */}
      {cachedSkill && (
        <div>
          <div className="text-text-dim uppercase tracking-wider mb-1">Cached skill at this fingerprint</div>
          <div className="bg-bg rounded p-2">
            <div className="flex items-center gap-2">
              <Badge variant="neutral">cached</Badge>
              {cachedSkill.status && (
                <Badge variant={cachedSkill.status === 'active' ? 'success' : 'info'}>
                  {cachedSkill.status}
                </Badge>
              )}
              {typeof cachedSkill.successRate === 'number' && (
                <span className="text-text-dim">
                  {(cachedSkill.successRate * 100).toFixed(0)}% over {cachedSkill.usageCount ?? 0} uses
                </span>
              )}
            </div>
            <div className="mt-1 text-text whitespace-pre-wrap">{cachedSkill.description}</div>
          </div>
        </div>
      )}

      {/* Related anti-patterns */}
      {relatedAntiPatterns.length > 0 && (
        <div>
          <div className="text-text-dim uppercase tracking-wider mb-1">Anti-patterns</div>
          <ul className="list-disc list-inside space-y-0.5">
            {relatedAntiPatterns.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent episodes for this signature */}
      <div>
        <div className="text-text-dim uppercase tracking-wider mb-1">
          Recent episodes ({recentEpisodes.length})
        </div>
        {recentEpisodes.length === 0 ? (
          <div className="text-text-dim italic">
            No episodes recorded for this fingerprint — proficiency may be derived from older traces
            already evicted from episodic memory.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-auto">
            {recentEpisodes.slice(0, 10).map((ep) => (
              <div key={`${ep.taskId}-${ep.timestamp}`} className="bg-bg rounded p-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge
                    variant={
                      ep.outcome === 'success'
                        ? 'success'
                        : ep.outcome === 'partial'
                          ? 'warning'
                          : 'error'
                    }
                  >
                    {ep.outcome}
                  </Badge>
                  {/* Deep-link to /trace pre-filtered to this taskId (the
                      page's local search matches taskId substring). Single
                      click jumps from the agent drawer's bounded episodic
                      memory to the durable trace record. */}
                  <Link
                    to={`/trace?search=${encodeURIComponent(ep.taskId)}`}
                    className="font-mono text-text-dim hover:text-accent transition-colors flex items-center gap-1"
                    title="Open Trace page with this taskId pre-searched"
                  >
                    {ep.taskId}
                    <ExternalLink size={9} />
                  </Link>
                  <span className="ml-auto text-text-dim">{timeAgo(ep.timestamp)}</span>
                </div>
                <div>{ep.lesson}</div>
                {ep.approachUsed && (
                  <div className="text-text-dim mt-0.5">approach: {ep.approachUsed}</div>
                )}
              </div>
            ))}
            {recentEpisodes.length > 10 && (
              <div className="text-text-dim italic">
                + {recentEpisodes.length - 10} older episode(s) for this fingerprint
              </div>
            )}
          </div>
        )}
      </div>

      {/* Operator action — reset this proficiency. Conservative: only the
          single signature is removed; episodes/lessons/preferred approaches
          stay. The agent re-learns from the next matching task. */}
      <div className="pt-2 border-t border-border/40 flex items-center justify-end gap-2">
        <span className="text-text-dim/70 text-[10px] flex-1">
          Reset removes this fingerprint's proficiency entry only. Episodes and lessons stay.
          The agent re-learns on its next task with this fingerprint.
        </span>
        <Link
          to={`/trace?taskSignature=${encodeURIComponent(prof.taskSignature)}`}
          className="px-2.5 py-1 text-[11px] rounded text-text-dim hover:text-text hover:bg-white/5 border border-border transition-colors flex items-center gap-1"
          title="Open the Trace page filtered to this fingerprint — full historical record (not bounded by episodic memory)."
        >
          <ExternalLink size={11} />
          View all traces
        </Link>
        <button
          type="button"
          onClick={() => {
            if (typeof window === 'undefined') return;
            const reason = window.prompt(
              `Reset proficiency for '${prof.taskSignature}'?\n\nOptional: short reason (logged on the server).`,
              '',
            );
            if (reason === null) return; // user cancelled
            onReset(reason.trim());
          }}
          disabled={isResetting}
          className="px-2.5 py-1 text-[11px] rounded text-amber-300/90 hover:bg-amber-300/10 border border-amber-300/30 transition-colors flex items-center gap-1 disabled:opacity-50"
          title="Remove this proficiency entry. Audit-logged on the server."
        >
          <RotateCcw size={11} />
          {isResetting ? 'Resetting…' : 'Reset proficiency'}
        </button>
      </div>
    </div>
  );
}

function DetailMini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[10px] text-text-dim uppercase tracking-wider">{label}</div>
      <div className="text-xs">{value}</div>
    </div>
  );
}

/**
 * Inline trend visualization — last N episodes for one fingerprint as colored
 * dots, oldest → newest. Bounded by what episodic memory currently retains
 * (episodes are evicted over time, so a high-attempts proficiency may show
 * fewer dots than its `totalAttempts`).
 */
function AttemptTrend({ episodes }: { episodes: readonly AgentEpisode[] }) {
  if (episodes.length === 0) {
    return <span className="text-text-dim/50 text-[10px]">no recent</span>;
  }
  // `episodes` arrives newest-first from the parent — flip to chronological
  // for the dot row and trim to the last 10.
  const recent = episodes.slice(0, 10).reverse();
  return (
    <div className="flex items-center gap-0.5">
      {recent.map((ep) => {
        const color =
          ep.outcome === 'success'
            ? 'bg-emerald-400/80'
            : ep.outcome === 'partial'
              ? 'bg-amber-400/80'
              : 'bg-rose-400/80';
        return (
          <span
            key={`${ep.taskId}-${ep.timestamp}`}
            className={cn('inline-block h-2 w-2 rounded-full', color)}
            title={`${ep.outcome} · ${timeAgo(ep.timestamp)} · ${ep.taskId}`}
          />
        );
      })}
    </div>
  );
}

/** One row in the agent's "Visible skills" section — name + scope badge + description. */
function AgentSkillRow({ skill, agentId }: { skill: SkillCatalogItem; agentId: string }) {
  const isOwned = skill.agentId === agentId;
  return (
    <li className="flex items-start gap-2 text-xs">
      <Badge variant={skill.kind === 'simple' ? 'info' : 'success'}>
        {skill.kind === 'simple' ? 'simple' : 'runtime'}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm">{skill.name}</span>
          {isOwned ? (
            <span className="text-accent/80 text-[10px]">per-agent</span>
          ) : (
            <span className="text-text-dim/70 text-[10px]">shared</span>
          )}
        </div>
        {skill.description && <div className="text-text-dim mt-0.5 truncate">{skill.description}</div>}
      </div>
    </li>
  );
}

function SoulTab({ detail }: { detail: ReturnType<typeof useAgent>['data'] }) {
  if (!detail) return <div className="text-sm text-text-dim">Loading…</div>;
  if (!detail.spec.soul) {
    return (
      <div className="space-y-2 text-sm">
        <div className="text-text-dim">No soul.md content available for this agent.</div>
        {detail.spec.soulPath && (
          <div className="text-xs text-text-dim">
            Path: <code className="bg-bg px-1 rounded">{detail.spec.soulPath}</code>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      {detail.spec.soulPath && (
        <div className="text-xs text-text-dim">
          <code className="bg-bg px-1 rounded">{detail.spec.soulPath}</code>
        </div>
      )}
      <pre className="bg-bg rounded p-3 text-xs whitespace-pre-wrap font-mono">
        {detail.spec.soul}
      </pre>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-text-dim shrink-0">{label}</span>
      <span className="text-text text-right truncate">{value}</span>
    </div>
  );
}
