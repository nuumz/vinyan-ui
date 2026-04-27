import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSSE } from '@/lib/use-sse';
import { qk } from '@/lib/query-keys';
import { useConnectionStore } from '@/store/connection-store';
import { useEventsStore } from '@/store/vinyan-store';
import { toast } from '@/store/toast-store';
import type { SSEEvent } from '@/lib/api-client';
import { useStreamingTurnStore } from '@/hooks/use-streaming-turn';

interface UseSSESyncOptions {
  enabled: boolean;
}

/**
 * Connects the global SSE stream and wires events to:
 *   1. The events log (client-side buffer for the Events page)
 *   2. TanStack Query cache invalidation (keeps tasks/workers/approvals fresh)
 *   3. The connection-store flag (gates fallback polling in query hooks)
 *   4. Toast notifications for approval requests
 *
 * Replaces the ad-hoc handleSSEEvent + startPolling in the old Zustand store.
 */
export function useSSESync({ enabled }: UseSSESyncOptions) {
  const queryClient = useQueryClient();
  const addEvent = useEventsStore((s) => s.addEvent);
  const ingestGlobalTurn = useStreamingTurnStore((s) => s.ingestGlobal);
  const clearTurn = useStreamingTurnStore((s) => s.clear);
  const setSSEConnected = useConnectionStore((s) => s.setSSEConnected);

  const handleEvent = useCallback(
    (event: SSEEvent) => {
      addEvent(event);
      const turnUpdate = ingestGlobalTurn(event);

      // Debounced batching would be nicer, but invalidateQueries is cheap —
      // TanStack Query dedups in-flight refetches automatically.
      const name = event.event;
      if (
        name === 'task:start' ||
        name === 'task:complete' ||
        name === 'task:escalate' ||
        name === 'task:timeout'
      ) {
        queryClient.invalidateQueries({ queryKey: qk.tasks });
        if (turnUpdate?.sessionId) {
          queryClient.invalidateQueries({ queryKey: qk.sessionMessages(turnUpdate.sessionId) });
          queryClient.invalidateQueries({ queryKey: qk.sessions });
        }
        if (turnUpdate && (turnUpdate.status === 'done' || turnUpdate.status === 'error')) {
          window.setTimeout(() => clearTurn(turnUpdate.sessionId), 800);
        }
      }
      if (name === 'worker:dispatch' || name === 'worker:complete' || name === 'worker:error') {
        queryClient.invalidateQueries({ queryKey: qk.workers });
      }
      if (name === 'task:approval_required') {
        queryClient.invalidateQueries({ queryKey: qk.approvals });
        const p = event.payload as { taskId?: string; riskScore?: number; reason?: string };
        toast.info(`Approval needed: ${p.reason ?? p.taskId ?? 'high-risk task'}`);
      }
      // Agent/session events: refresh session list (taskCount) + active chat history
      if (
        name === 'agent:turn_complete' ||
        name === 'agent:session_start' ||
        name === 'agent:session_end' ||
        name === 'session:created' ||
        name === 'session:compacted' ||
        name === 'session:updated' ||
        name === 'session:archived' ||
        name === 'session:unarchived' ||
        name === 'session:deleted' ||
        name === 'session:restored'
      ) {
        queryClient.invalidateQueries({ queryKey: qk.sessions });
        const sessionId = (event.payload as { sessionId?: string }).sessionId;
        if (sessionId) {
          queryClient.invalidateQueries({ queryKey: qk.sessionMessages(sessionId) });
        }
      }
      // Sleep cycle finalises pattern→skill promotion + rule changes; refresh
      // every Knowledge surface that may have changed in one shot.
      if (name === 'sleep:cycleComplete') {
        queryClient.invalidateQueries({ queryKey: qk.sleepCycle });
        queryClient.invalidateQueries({ queryKey: qk.patterns });
        queryClient.invalidateQueries({ queryKey: ['skills'] });
        queryClient.invalidateQueries({ queryKey: ['rules'] });
      }
      if (name === 'skill:outcome') {
        // Skill outcome updates totals/last_used; refresh skill list.
        queryClient.invalidateQueries({ queryKey: ['skills'] });
      }
      if (
        name === 'evolution:rulePromoted' ||
        name === 'evolution:ruleRetired' ||
        name === 'evolution:rulesApplied'
      ) {
        queryClient.invalidateQueries({ queryKey: ['rules'] });
      }
      if (name === 'graph:fact') {
        queryClient.invalidateQueries({ queryKey: qk.facts });
      }
      if (name === 'memory:approved' || name === 'memory:rejected') {
        queryClient.invalidateQueries({ queryKey: qk.memory });
      }
      // Agents emit `agent:tool_executed` with the tool name in the payload;
      // when the memory_propose tool runs there is a new pending record to
      // surface on the Memory page.
      if (name === 'agent:tool_executed') {
        const toolName = (event.payload as { toolName?: string }).toolName;
        if (toolName === 'memory_propose') {
          queryClient.invalidateQueries({ queryKey: qk.memory });
        }
      }
    },
    [queryClient, addEvent, ingestGlobalTurn, clearTurn],
  );

  const sse = useSSE({
    path: '/api/v1/events',
    onEvent: handleEvent,
    enabled,
  });

  // Publish connection state so query hooks can toggle their fallback polling.
  useEffect(() => {
    setSSEConnected(sse.connected);
  }, [sse.connected, setSSEConnected]);

  // On transition from disconnected → connected, refetch everything to catch
  // up on any events that happened during the gap.
  useEffect(() => {
    if (sse.connected) {
      queryClient.invalidateQueries();
    }
  }, [sse.connected, queryClient]);

  return sse;
}
