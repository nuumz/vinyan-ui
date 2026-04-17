import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSessionMessages, useSendMessage } from '@/hooks/use-chat';
import { cn } from '@/lib/utils';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';

export default function SessionChat() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? null;
  const messagesQuery = useSessionMessages(sessionId);
  const sendMessage = useSendMessage(sessionId);

  const messages = messagesQuery.data?.messages ?? [];
  const pendingClarifications = messagesQuery.data?.session?.pendingClarifications ?? [];
  const sending = sendMessage.isPending;

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Auto-grow textarea up to 6 lines
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
    sendMessage.mutate(text);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      {/* Header */}
      <div className="h-12 bg-surface border-b border-border flex items-center gap-3 px-4 shrink-0">
        <Link to="/sessions" className="text-text-dim hover:text-text transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <span className="text-sm font-medium">Session</span>
          <span className="text-xs text-text-dim ml-2 font-mono">{id}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !sending && (
          <div className="text-text-dim text-sm text-center py-12">
            Send a message to start the conversation
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={`${msg.role}-${msg.timestamp}`} message={msg} />
        ))}

        {/* Pending clarifications */}
        {pendingClarifications.length > 0 && (
          <div className="bg-yellow/5 border border-yellow/20 rounded-lg p-3">
            <div className="text-xs text-yellow font-medium mb-2">Clarification needed:</div>
            <ul className="list-disc list-inside text-sm text-text-dim space-y-1">
              {pendingClarifications.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {sending && (
          <div className="flex items-center gap-2 text-text-dim text-sm">
            <Loader2 size={14} className="animate-spin" />
            Thinking...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input — integrated pill with embedded send button */}
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
              pendingClarifications.length > 0
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

function MessageBubble({ message }: { message: { role: string; content: string; thinking?: string; toolsUsed?: string[]; timestamp: number } }) {
  const isUser = message.role === 'user';
  const [showThinking, setShowThinking] = useState(false);

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3 text-sm',
          isUser
            ? 'bg-accent/15 text-text border border-accent/20'
            : 'bg-surface border border-border text-text',
        )}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>

        {/* Thinking block */}
        {message.thinking && (
          <div className="mt-2">
            <button
              type="button"
              className="text-xs text-text-dim hover:text-text transition-colors"
              onClick={() => setShowThinking(!showThinking)}
            >
              {showThinking ? 'Hide thinking' : 'Show thinking'}
            </button>
            {showThinking && (
              <pre className="mt-1 text-xs text-text-dim bg-bg/50 rounded p-2 overflow-auto max-h-40">
                {message.thinking}
              </pre>
            )}
          </div>
        )}

        {/* Tools used */}
        {message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.toolsUsed.map((t) => (
              <span key={t} className="px-1.5 py-0.5 text-xs rounded bg-purple/10 text-purple border border-purple/20">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className="text-xs text-text-dim mt-1.5">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
