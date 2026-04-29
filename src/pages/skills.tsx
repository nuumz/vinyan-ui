import { useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import {
  useCreateSkill,
  useDeleteSkill,
  useSkill,
  useSkills,
  useUpdateSkill,
} from '@/hooks/use-skills';
import { PageHeader } from '@/components/ui/page-header';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { cn, timeAgo } from '@/lib/utils';
import type {
  SimpleSkillScope,
  SkillCatalogItem,
  SkillCatalogKind,
} from '@/lib/api-client';

type KindFilter = 'all' | SkillCatalogKind;

const KIND_LABEL: Record<SkillCatalogKind, string> = {
  simple: 'Simple',
  heavy: 'Runtime',
  cached: 'Cached',
};

const SCOPE_LABEL: Record<SimpleSkillScope, string> = {
  user: 'user',
  project: 'project',
  'user-agent': 'user / per-agent',
  'project-agent': 'project / per-agent',
};

export default function Skills() {
  const [filter, setFilter] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const skillsQuery = useSkills();
  const detailQuery = useSkill(selectedId);
  const deleteSkill = useDeleteSkill();

  const items = skillsQuery.data ?? [];

  const counts = useMemo(() => {
    const buckets: Record<KindFilter, number> = { all: items.length, simple: 0, heavy: 0, cached: 0 };
    for (const it of items) buckets[it.kind] += 1;
    return buckets;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((s) => {
      if (filter !== 'all' && s.kind !== filter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.agentId ?? '').toLowerCase().includes(q) ||
        (s.path ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, filter, search]);

  const tabs: ReadonlyArray<TabItem<KindFilter>> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'simple', label: 'Simple', count: counts.simple },
    { id: 'heavy', label: 'Runtime', count: counts.heavy },
    { id: 'cached', label: 'Cached', count: counts.cached },
  ];

  const isFetching = skillsQuery.isFetching;
  const loading = !skillsQuery.data && skillsQuery.isLoading;
  const selected = items.find((s) => s.id === selectedId) ?? null;
  const detail = detailQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Skill Library"
        description="Simple SKILL.md files, runtime epistemic skills, and cached reflex shortcuts."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="px-2.5 py-1 text-xs rounded bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 transition-colors flex items-center gap-1"
            >
              <Plus size={13} />
              Create skill
            </button>
            <button
              type="button"
              className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
              onClick={() => skillsQuery.refetch()}
              title="Refresh"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
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
            placeholder="Search name, description, or agent…"
            className="pl-8 pr-3 py-1.5 text-sm rounded bg-surface border border-border focus:outline-none focus:border-accent w-72"
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
            <SkillsEmptyState
              hasItems={items.length > 0}
              onCreate={() => setCreating(true)}
            />
          ) : (
            <SkillsTable
              items={filtered}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
            />
          )}
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected ? selected.name : 'Skill'}
        subtitle={selected?.description}
      >
        {selected && (
          <SkillDetailBody
            item={selected}
            detail={detail}
            isLoading={detailQuery.isLoading}
            onDelete={
              selected.editable
                ? async () => {
                    if (
                      typeof window !== 'undefined' &&
                      !window.confirm(`Delete '${selected.name}'? This removes the SKILL.md file.`)
                    ) {
                      return;
                    }
                    await deleteSkill.mutateAsync(selected.id);
                    setSelectedId(null);
                  }
                : null
            }
            isDeleting={deleteSkill.isPending}
          />
        )}
      </DetailDrawer>

      {creating && <CreateSkillDrawer onClose={() => setCreating(false)} />}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────

function SkillsEmptyState({ hasItems, onCreate }: { hasItems: boolean; onCreate: () => void }) {
  if (hasItems) {
    return <EmptyState message="No skills match filters" hint="Adjust the kind tab or search." />;
  }
  return (
    <div className="p-12 text-center space-y-3">
      <div className="text-text-dim">No skills found</div>
      <div className="text-xs text-text-dim/80 max-w-md mx-auto leading-relaxed">
        Drop a SKILL.md under{' '}
        <code className="px-1 py-0.5 bg-bg rounded text-xs">.vinyan/skills/&lt;name&gt;/</code> in
        this workspace, or let Vinyan promote one from a successful trace. Per-agent skills go
        under{' '}
        <code className="px-1 py-0.5 bg-bg rounded text-xs">.vinyan/agents/&lt;id&gt;/skills/</code>.
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 px-3 py-1.5 text-xs rounded bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30 transition-colors"
      >
        Create your first skill
      </button>
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────────

function SkillsTable({
  items,
  selectedId,
  onSelect,
}: {
  items: readonly SkillCatalogItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-text-dim text-xs">
          <th className="px-4 py-2">Name</th>
          <th className="px-4 py-2">Description</th>
          <th className="px-4 py-2">Kind</th>
          <th className="px-4 py-2">Source</th>
          <th className="px-4 py-2 text-right">Status</th>
          <th className="px-4 py-2 text-right">Updated</th>
        </tr>
      </thead>
      <tbody>
        {items.map((s) => (
          <tr
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={cn(
              'border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors',
              selectedId === s.id && 'bg-white/[0.02]',
            )}
          >
            <td className="px-4 py-2 font-mono text-xs truncate max-w-[18rem]" title={s.name}>
              {s.name}
            </td>
            <td className="px-4 py-2 text-text-dim truncate max-w-[26rem]" title={s.description}>
              {s.description || <span className="italic text-text-dim/60">no description</span>}
            </td>
            <td className="px-4 py-2">
              <Badge variant={kindVariant(s.kind)}>{KIND_LABEL[s.kind]}</Badge>
            </td>
            <td className="px-4 py-2 text-xs text-text-dim">
              {sourceDisplay(s)}
              {s.agentId && (
                <span className="ml-1 text-accent/80 font-mono">@{s.agentId}</span>
              )}
            </td>
            <td className="px-4 py-2 text-right">
              {s.status ? <StatusBadge status={s.status} /> : <span className="text-text-dim/60">—</span>}
            </td>
            <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
              {s.lastUpdated ? timeAgo(s.lastUpdated) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function kindVariant(kind: SkillCatalogKind): 'info' | 'success' | 'neutral' {
  switch (kind) {
    case 'simple':
      return 'info';
    case 'heavy':
      return 'success';
    case 'cached':
      return 'neutral';
  }
}

function sourceDisplay(item: SkillCatalogItem): string {
  if (item.kind === 'simple' && item.scope) return SCOPE_LABEL[item.scope];
  if (item.source === 'artifact-store') return 'runtime';
  if (item.source === 'cached_skills') return 'reflex (auto-promoted)';
  return item.source;
}

// ── Detail drawer body ─────────────────────────────────────────────

function SkillDetailBody({
  item,
  detail,
  isLoading,
  onDelete,
  isDeleting,
}: {
  item: SkillCatalogItem;
  detail: ReturnType<typeof useSkill>['data'];
  isLoading: boolean;
  onDelete: (() => Promise<void>) | null;
  isDeleting: boolean;
}) {
  return (
    <div className="space-y-3 text-sm">
      <Row label="Kind" value={<Badge variant={kindVariant(item.kind)}>{KIND_LABEL[item.kind]}</Badge>} />
      <Row label="Source" value={sourceDisplay(item)} />
      {item.agentId && <Row label="Agent" value={<span className="font-mono">{item.agentId}</span>} />}
      {item.status && <Row label="Status" value={<StatusBadge status={item.status} />} />}
      {item.trustTier && <Row label="Trust tier" value={<Badge variant="info">{item.trustTier}</Badge>} />}
      {typeof item.successRate === 'number' && (
        <Row label="Success rate" value={`${(item.successRate * 100).toFixed(1)}%`} />
      )}
      {typeof item.usageCount === 'number' && <Row label="Usage count" value={item.usageCount} />}
      {item.path && (
        <Row label="Path" value={<span className="font-mono text-xs break-all">{item.path}</span>} />
      )}
      {item.contentHash && (
        <Row
          label="Content hash"
          value={<span className="font-mono text-xs">{item.contentHash.slice(0, 18)}…</span>}
        />
      )}

      <div className="border-t border-border/50 my-3" />

      {isLoading ? (
        <div className="text-text-dim text-xs">Loading skill body…</div>
      ) : detail?.body ? (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Body</div>
          <pre className="bg-bg rounded p-3 whitespace-pre-wrap text-xs leading-relaxed font-mono overflow-auto max-h-[24rem]">
            {detail.body}
          </pre>
        </div>
      ) : detail?.approach ? (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Approach</div>
          <div className="bg-bg rounded p-3 whitespace-pre-wrap text-sm">{detail.approach}</div>
        </div>
      ) : (
        <div className="text-text-dim text-xs italic">No body available.</div>
      )}

      {detail?.files && detail.files.length > 0 && (
        <div>
          <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">Whitelisted files</div>
          <ul className="text-xs space-y-1 font-mono">
            {detail.files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {onDelete && (
        <div className="pt-3 border-t border-border/50 flex items-center justify-end">
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="px-2.5 py-1 text-xs rounded text-red-400 hover:bg-red-400/10 border border-red-400/30 transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <Trash2 size={12} />
            {isDeleting ? 'Deleting…' : 'Delete skill'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Create drawer ─────────────────────────────────────────────────

function CreateSkillDrawer({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<SimpleSkillScope>('project');
  const [agentId, setAgentId] = useState('');
  const create = useCreateSkill();

  const requiresAgent = scope === 'user-agent' || scope === 'project-agent';
  const canSubmit =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    body.trim().length > 0 &&
    (!requiresAgent || agentId.trim().length > 0);

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute right-0 top-0 bottom-0 w-[36rem] bg-surface border-l border-border shadow-xl overflow-auto">
        <div className="p-4 border-b border-border flex items-start justify-between">
          <div>
            <div className="font-semibold">New simple skill</div>
            <div className="text-xs text-text-dim mt-0.5">
              Writes <code className="px-1 py-0.5 bg-bg rounded">SKILL.md</code> under the chosen scope.
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5">
            <X size={16} />
          </button>
        </div>

        <form
          className="p-4 space-y-4 text-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!canSubmit) return;
            try {
              await create.mutateAsync({
                name: name.trim(),
                description: description.trim(),
                body,
                scope,
                ...(requiresAgent ? { agentId: agentId.trim() } : {}),
              });
              onClose();
            } catch {
              /* toast handled by hook */
            }
          }}
        >
          <Field label="Name" hint="Lowercase slug, e.g. code-review">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="code-review"
              className="w-full px-2 py-1.5 text-sm rounded bg-bg border border-border focus:outline-none focus:border-accent font-mono"
            />
          </Field>
          <Field label="Description" hint="One line — the matcher reads this.">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Review TypeScript code for bugs. Use when reviewing PRs."
              className="w-full px-2 py-1.5 text-sm rounded bg-bg border border-border focus:outline-none focus:border-accent"
            />
          </Field>
          <Field label="Body" hint="Markdown. Loaded into the prompt when the skill matches.">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              placeholder="When reviewing code:&#10;1. Check null derefs and error handling&#10;2. ..."
              className="w-full px-2 py-1.5 text-sm rounded bg-bg border border-border focus:outline-none focus:border-accent font-mono"
            />
          </Field>
          <Field label="Scope">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as SimpleSkillScope)}
              className="w-full px-2 py-1.5 text-sm rounded bg-bg border border-border focus:outline-none focus:border-accent"
            >
              <option value="project">project (this workspace)</option>
              <option value="user">user (global, ~/.vinyan)</option>
              <option value="project-agent">project, per-agent</option>
              <option value="user-agent">user, per-agent</option>
            </select>
          </Field>
          {requiresAgent && (
            <Field label="Agent ID" hint="The persona this skill is bound to.">
              <input
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="researcher"
                className="w-full px-2 py-1.5 text-sm rounded bg-bg border border-border focus:outline-none focus:border-accent font-mono"
              />
            </Field>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded text-text-dim hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || create.isPending}
              className="px-3 py-1.5 text-sm rounded bg-accent/20 text-accent hover:bg-accent/30 border border-accent/30 disabled:opacity-50"
            >
              {create.isPending ? 'Creating…' : 'Create skill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-xs text-text-dim/70 mt-1">{hint}</div>}
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
