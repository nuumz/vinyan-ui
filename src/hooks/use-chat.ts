import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ConversationEntry, type SessionDetail, type TaskResult } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';
import { useEventsStore } from '@/store/vinyan-store';

interface MessagesPayload {
  session: SessionDetail;
  messages: ConversationEntry[];
}

/** Fetch a session's conversation history. Null sessionId disables the query. */
export function useSessionMessages(sessionId: string | null) {
  return useQuery({
    queryKey: qk.sessionMessages(sessionId ?? ''),
    queryFn: () => api.getMessages(sessionId!),
    enabled: !!sessionId,
    // Session history doesn't change except via sends, which invalidate explicitly.
    staleTime: Infinity,
  });
}

interface SendContext {
  previous: MessagesPayload | undefined;
}

/**
 * Send a chat message. Uses SSE streaming under the hood so long-running tasks
 * don't trip fetch timeouts. Optimistically appends the user message and rolls
 * back on failure.
 */
export function useSendMessage(sessionId: string | null) {
  const qc = useQueryClient();
  const addEvent = useEventsStore((s) => s.addEvent);

  return useMutation<TaskResult, Error, string, SendContext>({
    mutationFn: async (content) => {
      if (!sessionId) throw new Error('No active session');
      return api.sendMessageStream(sessionId, content, {
        onEvent: (ev) => addEvent(ev),
      });
    },
    onMutate: async (content) => {
      if (!sessionId) return { previous: undefined };
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
      // Reload the authoritative history (assistant turn, tool trace, etc.)
      qc.invalidateQueries({ queryKey: qk.sessionMessages(sessionId) });
      // Session taskCount / lastActivity change too
      qc.invalidateQueries({ queryKey: qk.sessions });
    },
    onError: (err, _content, ctx) => {
      if (sessionId && ctx?.previous !== undefined) {
        qc.setQueryData(qk.sessionMessages(sessionId), ctx.previous);
      }
      // Server may still have partial state — refetch to reconcile
      if (sessionId) {
        qc.invalidateQueries({ queryKey: qk.sessionMessages(sessionId) });
      }
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
    },
  });
}
