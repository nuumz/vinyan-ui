import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useSkills } from '@/hooks/use-skills';
import { PageHeader } from '@/components/ui/page-header';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { cn, timeAgo } from '@/lib/utils';
import type { CachedSkill } from '@/lib/api-client';

type StatusFilter = 'all' | 'active' | 'probation' | 'demoted';

export default function Skills() {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const skillsQuery = useSkills(filter === 'all' ? undefined : filter);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CachedSkill | null>(null);

  const skills = skillsQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.taskSignature.toLowerCase().includes(q) ||
        s.approach.toLowerCase().includes(q) ||
        (s.agentId ?? '').toLowerCase().includes(q),
    );
  }, [skills, search]);

  const counts = useMemo(() => {
    const all = skillsQuery.data ?? [];
    return {
      all: all.length,
      active: all.filter((s) => s.status === 'active').length,
      probation: all.filter((s) => s.status === 'probation').length,
      demoted: all.filter((s) => s.status === 'demoted').length,
    };
  }, [skillsQuery.data]);

  const tabs: ReadonlyArray<TabItem<StatusFilter>> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'probation', label: 'Probation', count: counts.probation },
    { id: 'demoted', label: 'Demoted', count: counts.demoted },
  ];

  const isFetching = skillsQuery.isFetching;
  const loading = !skillsQuery.data && skillsQuery.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Skills"
        description="Cached approaches — proven strategies reusable at L0 reflex tier."
        actions={
          <button
            type="button"
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            onClick={() => skillsQuery.refetch()}
            title="Refresh"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs items={tabs} active={filter} onChange={setFilter} className="flex-1 min-w-[16rem]" />
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search signature or approach…"
            className="pl-8 pr-3 py-1.5 text-sm rounded bg-surface border border-border focus:outline-none focus:border-accent w-64"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : skillsQuery.isError ? (
        <div className="bg-surface rounded-lg border border-border">
          <ErrorState
            error={skillsQuery.error}
            onRetry={() => skillsQuery.refetch()}
            retrying={skillsQuery.isFetching}
          />
        </div>
      ) : (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              message={skills.length === 0 ? 'No skills cached yet' : 'No skills match filters'}
              hint={skills.length === 0 ? 'Skills form automatically from successful traces' : undefined}
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-dim text-xs">
                  <th className="px-4 py-2">Signature</th>
                  <th className="px-4 py-2">Approach</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Success</th>
                  <th className="px-4 py-2 text-right">Usage</th>
                  <th className="px-4 py-2 text-right">Agent</th>
                  <th className="px-4 py-2 text-right">Verified</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.taskSignature}
                    onClick={() => setSelected(s)}
                    className={cn(
                      'border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors',
                      selected?.taskSignature === s.taskSignature && 'bg-white/[0.02]',
                    )}
                  >
                    <td className="px-4 py-2 font-mono text-xs truncate max-w-[20rem]" title={s.taskSignature}>
                      {s.taskSignature}
                    </td>
                    <td className="px-4 py-2 text-text-dim truncate max-w-[24rem]">{s.approach}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-2 tabular-nums text-right">
                      {(s.successRate * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2 tabular-nums text-right">{s.usageCount}</td>
                    <td className="px-4 py-2 text-right text-text-dim text-xs">
                      {s.agentId ?? <span className="text-text-dim/60">shared</span>}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
                      {s.lastVerifiedAt ? timeAgo(s.lastVerifiedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Skill"
        subtitle={selected?.taskSignature}
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-text-dim uppercase tracking-wider mb-1">Approach</div>
              <div className="bg-bg rounded p-3 whitespace-pre-wrap">{selected.approach}</div>
            </div>
            <Row label="Status" value={<StatusBadge status={selected.status} />} />
            <Row label="Success rate" value={`${(selected.successRate * 100).toFixed(1)}%`} />
            <Row label="Usage count" value={selected.usageCount} />
            <Row label="Probation remaining" value={selected.probationRemaining} />
            <Row label="Risk at creation" value={selected.riskAtCreation.toFixed(3)} />
            <Row
              label="Verification profile"
              value={<Badge variant="info">{selected.verificationProfile}</Badge>}
            />
            {selected.origin && <Row label="Origin" value={selected.origin} />}
            <Row label="Agent" value={selected.agentId ?? 'shared (legacy)'} />
            <Row
              label="Last verified"
              value={selected.lastVerifiedAt ? timeAgo(selected.lastVerifiedAt) : '—'}
            />
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-dim">{label}</span>
      <span className="text-text text-right">{value}</span>
    </div>
  );
}
