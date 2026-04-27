import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSessionMessages, useSendMessage } from '@/hooks/use-chat';
import { useStreamingTurn, useStreamingTurnStore } from '@/hooks/use-streaming-turn';
import { cn } from '@/lib/utils';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { MessageBubble } from '@/components/chat/message-bubble';
import { StreamingBubble } from '@/components/chat/streaming-bubble';

export default function SessionChat() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? null;
  const messagesQuery = useSessionMessages(sessionId);
  const sendMessage = useSendMessage(sessionId);
  const turn = useStreamingTurn(sessionId);
  const clearTurn = useStreamingTurnStore((s) => s.clear);

  const messages = messagesQuery.data?.messages ?? [];
  const pendingClarifications = messagesQuery.data?.session?.pendingClarifications ?? [];
  // Treat the input as busy whenever a turn is still running — even if this
  // is a fresh mount of the page after navigating back (the mutation hook
  // state is gone, but the turn in the zustand store tells us the previous
  // task is still streaming).
  const sending = sendMessage.isPending || turn?.status === 'running';

  const [input, setInput] = useState('');
  const [lastSent, setLastSent] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Live elapsed clock — 250ms ticks only while a turn is active.
  useEffect(() => {
    if (!turn || turn.status !== 'running') return;
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, [turn?.status]);

  // Clear any stale streaming bubble when switching sessions / unmounting.
  // `clearTurn` is a no-op in the store if the turn is still `running`, so
  // navigating away mid-task preserves progress — otherwise the `ingest`
  // reducer's `if (!prev) return s` guard would silently drop every
  // subsequent SSE event from the still-open fetch.
  useEffect(() => {
    return () => {
      if (sessionId) clearTurn(sessionId);
    };
  }, [sessionId, clearTurn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, turn?.toolCalls.length, turn?.finalContent, turn?.status]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setLastSent(text);
    sendMessage.mutate(text);
  };

  const handleRetry = () => {
    if (!lastSent || sending) return;
    sendMessage.mutate(lastSent);
  };

  const showStreaming = !!turn && turn.status !== 'idle';

  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      <div className="h-12 bg-surface border-b border-border flex items-center gap-3 px-4 shrink-0">
        <Link to="/sessions" className="text-text-dim hover:text-text transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <span className="text-sm font-medium">Session</span>
          <span className="text-xs text-text-dim ml-2 font-mono">{id}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !showStreaming && (
          <div className="text-text-dim text-sm text-center py-12">
            Send a message to start the conversation
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={`${msg.role}-${msg.timestamp}-${msg.taskId}`} message={msg} />
        ))}

        {showStreaming && turn && (
          <StreamingBubble turn={turn} nowMs={nowMs} onRetry={handleRetry} />
        )}

        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-4 pb-4 pt-2">
        <div
          className={cn(
            'flex items-end gap-2 bg-surface border border-border rounded-xl px-3 py-2 transition-colors',
            'focus-within:border-accent/60',
          )}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            className="flex-1 bg-transparent text-sm text-text placeholder-gray-500 focus:outline-none resize-none leading-6 py-1 max-h-40"
            placeholder={
              (turn?.status === 'input-required' || pendingClarifications.length > 0)
                ? 'Answer the clarification...'
                : 'Type a message...  (Enter to send · Shift+Enter for newline)'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sending}
            autoFocus
          />
          <button
            type="button"
            className={cn(
              'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
              input.trim() && !sending
                ? 'bg-accent text-white hover:bg-accent/80'
                : 'bg-border/50 text-text-dim cursor-not-allowed',
            )}
            onClick={handleSend}
            disabled={!input.trim() || sending}
            aria-label="Send"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
