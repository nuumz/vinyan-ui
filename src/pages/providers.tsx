import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useProviders } from '@/hooks/use-providers';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { cn, timeAgo } from '@/lib/utils';
import type { ProviderTrustRecord } from '@/lib/api-client';

export default function Providers() {
  const query = useProviders();
  const [search, setSearch] = useState('');

  const data = query.data;
  const providers = data?.providers ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) => p.provider.toLowerCase().includes(q) || p.capability.toLowerCase().includes(q),
    );
  }, [providers, search]);

  const loading = !query.data && query.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Provider Trust"
        description="LLM provider reliability per capability — empirical trust from completed tasks."
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      {data && !data.enabled && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <div className="text-sm">Provider trust store not configured</div>
          <div className="text-xs text-text-dim mt-1">
            Requires economy to be enabled + persistent database.
          </div>
        </div>
      )}

      {data?.enabled && (
        <>
          <div className="relative w-80">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search provider or capability…"
              className="pl-8 pr-3 py-1.5 text-sm rounded bg-surface border border-border focus:outline-none focus:border-accent w-full"
            />
          </div>

          {loading ? (
            <TableSkeleton rows={5} />
          ) : (
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              {filtered.length === 0 ? (
                <EmptyState
                  message={providers.length === 0 ? 'No provider data yet' : 'No providers match filter'}
                  hint={providers.length === 0 ? 'Trust records accumulate after tasks complete' : undefined}
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-dim text-xs">
                      <th className="px-4 py-2">Provider</th>
                      <th className="px-4 py-2">Capability</th>
                      <th className="px-4 py-2 text-right">Successes</th>
                      <th className="px-4 py-2 text-right">Failures</th>
                      <th className="px-4 py-2 text-right">Rate</th>
                      <th className="px-4 py-2 text-right">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <ProviderRow key={`${p.provider}/${p.capability}`} record={p} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProviderRow({ record }: { record: ProviderTrustRecord }) {
  const total = record.successes + record.failures;
  const rate = total > 0 ? record.successes / total : null;
  const rateColor =
    rate == null
      ? 'text-text-dim'
      : rate >= 0.9
        ? 'text-green'
        : rate >= 0.7
          ? 'text-yellow'
          : 'text-red';

  return (
    <tr className="border-b border-border/50">
      <td className="px-4 py-2 font-mono text-xs">{record.provider}</td>
      <td className="px-4 py-2 text-xs text-text-dim">{record.capability}</td>
      <td className="px-4 py-2 tabular-nums text-right text-green">{record.successes}</td>
      <td className="px-4 py-2 tabular-nums text-right text-red">{record.failures}</td>
      <td className={cn('px-4 py-2 tabular-nums text-right', rateColor)}>
        {rate != null ? `${(rate * 100).toFixed(0)}%` : '—'}
      </td>
      <td className="px-4 py-2 tabular-nums text-right text-text-dim text-xs">
        {timeAgo(record.lastUpdated)}
      </td>
    </tr>
  );
}
