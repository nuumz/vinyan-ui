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
    queryFn: () => api.getMessages(sessionId!),
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
      }
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
    },
  });
}
