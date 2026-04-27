import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ConversationEntry, type SessionDetail, type TaskResult } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';
import { useEventsStore } from '@/store/vinyan-store';
import { useStreamingTurnStore } from '@/hooks/use-streaming-turn';

interface MessagesPayload {
  session: SessionDetail;
  messages: ConversationEntry[];
}

export function useSessionMessages(sessionId: string | null) {
  return useQuery({
    queryKey: qk.sessionMessages(sessionId ?? ''),
    // Bound history to the most recent 200 entries. Long-running sessions
    // would otherwise download thousands of turns on every mount and the
    // table-style render dominates first paint. The backend response
    // shape `messages: ConversationEntry[]` is already the most recent N.
    queryFn: () => api.getMessages(sessionId!, 200),
    enabled: !!sessionId,
    staleTime: Infinity,
  });
}

interface SendContext {
  previous: MessagesPayload | undefined;
}

/**
 * Send a chat message. Uses SSE streaming so long-running tasks don't trip
 * fetch timeouts. Each SSE event is dispatched into both the global events
 * store and the per-session streaming-turn reducer that powers the live
 * "Claude Code"-style bubble in session-chat.
 */
export function useSendMessage(sessionId: string | null) {
  const qc = useQueryClient();
  const addEvent = useEventsStore((s) => s.addEvent);
  const startTurn = useStreamingTurnStore((s) => s.start);
  const ingestTurn = useStreamingTurnStore((s) => s.ingest);
  const clearTurn = useStreamingTurnStore((s) => s.clear);
  const setTurnError = useStreamingTurnStore((s) => s.setError);

  return useMutation<TaskResult, Error, string, SendContext>({
    mutationFn: async (content) => {
      if (!sessionId) throw new Error('No active session');
      return api.sendMessageStream(sessionId, content, {
        onEvent: (ev) => {
          addEvent(ev);
          ingestTurn(sessionId, ev);
        },
      });
    },
    onMutate: async (content) => {
      if (!sessionId) return { previous: undefined };
      startTurn(sessionId);
      const key = qk.sessionMessages(sessionId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MessagesPayload>(key);
      qc.setQueryData<MessagesPayload | undefined>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          messages: [
            ...old.messages,
            {
              role: 'user',
              content,
              taskId: '',
              timestamp: Date.now(),
              tokenEstimate: 0,
            },
          ],
        };
      });
      return { previous };
    },
    onSuccess: () => {
      if (!sessionId) return;
      const sid = sessionId;
      qc.invalidateQueries({ queryKey: qk.sessionMessages(sid) });
      qc.invalidateQueries({ queryKey: qk.sessions });
      setTimeout(() => clearTurn(sid), 400);
    },
    onError: (err: Error, _content: string, ctx: SendContext | undefined) => {
      if (sessionId && ctx?.previous !== undefined) {
        qc.setQueryData(qk.sessionMessages(sessionId), ctx.previous);
      }
      if (sessionId) {
        qc.invalidateQueries({ queryKey: qk.sessionMessages(sessionId) });
        // Flip the turn from `running` → `error` so (a) the input unlocks
        // (its `sending` guard keys off `turn.status === 'running'`) and
        // (b) the delayed clear below can actually fire (the store's clear
        // is a no-op while status is running, to guard against a stale
        // timeout wiping a freshly-started turn). Without this the bubble
        // would stay stuck in `running` forever on any fetch-level failure
        // that never produced an SSE `task:complete`.
        const sid = sessionId;
        const reason = err instanceof Error ? err.message : 'Send failed';
        setTurnError(sid, reason);
        setTimeout(() => clearTurn(sid), 400);
      }
      // The streaming bubble itself shows the structured error + Retry, so
      // the toast is just a secondary nudge for users whose bubble has
      // scrolled offscreen. No Retry action here — clicking the bubble's
      // button is the canonical path (it preserves the original input).
      toast.apiError(err, { fallback: 'Failed to send message' });
    },
  });
}
