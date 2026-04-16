import { useMemo } from 'react';
import { useVinyanStore } from '@/store/vinyan-store';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export default function Peers() {
  const events = useVinyanStore((s) => s.events);

  const peerEvents = useMemo(
    () => events.filter((e) => e.event.includes('a2a') || e.event.includes('peer')),
    [events],
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Peers" description="A2A peer activity" />

      <div className="bg-surface rounded-lg border border-border p-4">
        {peerEvents.length === 0 ? (
          <EmptyState
            message="No peer events"
            hint="network.instances.enabled"
          />
        ) : (
          <div className="space-y-2">
            {peerEvents.slice(0, 50).map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                <span className="px-1.5 py-0.5 rounded border bg-purple/10 text-purple border-purple/30 shrink-0">
                  {e.event}
                </span>
                <span className="text-text-dim truncate">{JSON.stringify(e.payload).slice(0, 100)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
