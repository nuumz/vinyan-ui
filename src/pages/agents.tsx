import { useState } from 'react';
import { RefreshCw, Star } from 'lucide-react';
import { useAgents, useAgent } from '@/hooks/use-agents';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { cn, timeAgo } from '@/lib/utils';
import type { AgentListEntry } from '@/lib/api-client';

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
          <Tabs items={tabs} active={tab} onChange={setTab} />

          {tab === 'overview' && <OverviewTab agent={agent} detail={detail} />}
          {tab === 'memory' && <MemoryTab detail={detail} />}
          {tab === 'skills' && <SkillsTab detail={detail} />}
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

function SkillsTab({ detail }: { detail: ReturnType<typeof useAgent>['data'] }) {
  if (!detail?.context) {
    return <div className="text-sm text-text-dim">No context recorded yet for this agent.</div>;
  }
  const { proficiencies, preferredApproaches, antiPatterns } = detail.context.skills;
  const profList = Object.values(proficiencies);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">
          Proficiencies ({profList.length})
        </div>
        {profList.length === 0 ? (
          <div className="text-text-dim">No proficiencies yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-dim border-b border-border/50">
                <th className="text-left pb-1.5">Signature</th>
                <th className="text-left pb-1.5">Level</th>
                <th className="text-right pb-1.5">Success</th>
                <th className="text-right pb-1.5">Attempts</th>
              </tr>
            </thead>
            <tbody>
              {profList.map((p) => (
                <tr key={p.taskSignature} className="border-b border-border/30 last:border-0">
                  <td className="py-1 font-mono truncate max-w-[16rem]">{p.taskSignature}</td>
                  <td className="py-1">
                    <Badge
                      variant={
                        p.level === 'expert'
                          ? 'success'
                          : p.level === 'competent'
                            ? 'info'
                            : 'neutral'
                      }
                    >
                      {p.level}
                    </Badge>
                  </td>
                  <td className="py-1 tabular-nums text-right">
                    {(p.successRate * 100).toFixed(0)}%
                  </td>
                  <td className="py-1 tabular-nums text-right">{p.totalAttempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {Object.keys(preferredApproaches).length > 0 && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">
            Preferred Approaches
          </div>
          <div className="space-y-1.5 text-xs">
            {Object.entries(preferredApproaches).map(([sig, approach]) => (
              <div key={sig} className="bg-bg rounded p-2">
                <div className="font-mono text-text-dim">{sig}</div>
                <div className="mt-0.5">{approach}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {antiPatterns.length > 0 && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Anti-Patterns</div>
          <ul className="list-disc list-inside space-y-1 text-xs">
            {antiPatterns.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
