import { useMemo, useState } from 'react';
import { RefreshCw, Plug, PlugZap, Search } from 'lucide-react';
import { useMCP } from '@/hooks/use-mcp';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { cn } from '@/lib/utils';
import type { MCPServerEntry, MCPToolEntry } from '@/lib/api-client';

export default function MCP() {
  const query = useMCP();
  const data = query.data;
  const [selectedServer, setSelectedServer] = useState<MCPServerEntry | null>(null);
  const [search, setSearch] = useState('');

  const servers = data?.servers ?? [];
  const tools = data?.tools ?? [];

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        t.serverName.toLowerCase().includes(q),
    );
  }, [tools, search]);

  const toolsForSelected = useMemo(() => {
    if (!selectedServer) return [];
    return tools.filter((t) => t.serverName === selectedServer.name);
  }, [tools, selectedServer]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="MCP Servers"
        description="External Model Context Protocol servers — tool providers outside the Vinyan orchestrator."
        actions={
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />
          </button>
        }
      />

      {query.isLoading && <EmptyState message="Loading MCP servers…" />}

      {data && !data.enabled && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <Plug size={28} className="mx-auto text-text-dim mb-2" />
          <div className="text-sm">MCP client pool is not configured</div>
          <div className="text-xs text-text-dim mt-1">
            Add servers under <code className="bg-bg px-1 rounded">network.mcp.client_servers</code>{' '}
            in <code className="bg-bg px-1 rounded">vinyan.json</code>.
          </div>
        </div>
      )}

      {data && data.enabled && (
        <>
          {/* Servers */}
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            {servers.length === 0 ? (
              <EmptyState message="No MCP servers configured" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-dim text-xs">
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Trust</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Tools</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((s) => (
                    <tr
                      key={s.name}
                      onClick={() => setSelectedServer(s)}
                      className={cn(
                        'border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors',
                        selectedServer?.name === s.name && 'bg-white/[0.02]',
                      )}
                    >
                      <td className="px-4 py-2 font-mono text-xs">{s.name}</td>
                      <td className="px-4 py-2">
                        <TrustBadge level={s.trustLevel} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          {s.connected ? (
                            <PlugZap size={14} className="text-green" />
                          ) : (
                            <Plug size={14} className="text-text-dim" />
                          )}
                          <Badge variant={s.connected ? 'success' : 'neutral'}>
                            {s.connected ? 'connected' : 'disconnected'}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-2 tabular-nums text-right">{s.toolCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* All tools */}
          {tools.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-dim uppercase tracking-wider">
                  Tools ({tools.length})
                </h3>
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tool name…"
                    className="pl-8 pr-3 py-1.5 text-sm rounded bg-surface border border-border focus:outline-none focus:border-accent w-64"
                  />
                </div>
              </div>

              <div className="bg-surface rounded-lg border border-border overflow-hidden">
                {filteredTools.length === 0 ? (
                  <EmptyState message="No tools match filter" />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-dim text-xs">
                        <th className="px-4 py-2">Server</th>
                        <th className="px-4 py-2">Tool</th>
                        <th className="px-4 py-2">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTools.map((t) => (
                        <tr key={`${t.serverName}/${t.name}`} className="border-b border-border/50">
                          <td className="px-4 py-2 font-mono text-xs text-text-dim">
                            {t.serverName}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">{t.name}</td>
                          <td className="px-4 py-2 text-text-dim truncate max-w-[32rem]">
                            {t.description ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <DetailDrawer
        open={selectedServer !== null}
        onClose={() => setSelectedServer(null)}
        title={selectedServer?.name ?? ''}
        subtitle={selectedServer?.connected ? 'Connected' : 'Disconnected'}
      >
        {selectedServer && (
          <div className="space-y-3 text-sm">
            <Row label="Trust level" value={<TrustBadge level={selectedServer.trustLevel} />} />
            <Row
              label="Status"
              value={
                <Badge variant={selectedServer.connected ? 'success' : 'neutral'}>
                  {selectedServer.connected ? 'connected' : 'disconnected'}
                </Badge>
              }
            />
            <Row label="Tool count" value={selectedServer.toolCount} />

            <div>
              <div className="text-xs text-text-dim uppercase tracking-wider mb-1.5">
                Tools ({toolsForSelected.length})
              </div>
              {toolsForSelected.length === 0 ? (
                <div className="text-text-dim">No tools exposed.</div>
              ) : (
                <div className="space-y-1.5">
                  {toolsForSelected.map((t) => (
                    <ToolCard key={t.name} tool={t} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

function TrustBadge({ level }: { level: string }) {
  const variant =
    level === 'trusted' ? 'success' : level === 'verified' ? 'info' : level === 'untrusted' ? 'warning' : 'neutral';
  return <Badge variant={variant}>{level}</Badge>;
}

function ToolCard({ tool }: { tool: MCPToolEntry }) {
  return (
    <div className="bg-bg rounded p-2">
      <div className="font-mono text-xs">{tool.name}</div>
      {tool.description && (
        <div className="text-xs text-text-dim mt-0.5">{tool.description}</div>
      )}
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
