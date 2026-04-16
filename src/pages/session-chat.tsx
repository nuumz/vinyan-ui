import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useVinyanStore } from '@/store/vinyan-store';
import { cn } from '@/lib/utils';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';

export default function SessionChat() {
  const { id } = useParams<{ id: string }>();
  const messages = useVinyanStore((s) => s.chatMessages);
  const sending = useVinyanStore((s) => s.chatSending);
  const pendingClarifications = useVinyanStore((s) => s.chatPendingClarifications);
  const openChat = useVinyanStore((s) => s.openChat);
  const sendChatMessage = useVinyanStore((s) => s.sendChatMessage);
  const closeChat = useVinyanStore((s) => s.closeChat);

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) openChat(id);
    return () => closeChat();
  }, [id, openChat, closeChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    await sendChatMessage(text);
  };

  return (
    <div className="flex flex-col h-full -m-6">
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
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && !sending && (
          <div className="text-text-dim text-sm text-center py-12">
            Send a message to start the conversation
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {/* Pending clarifications */}
        {pendingClarifications.length > 0 && (
          <div className="bg-yellow/5 border border-yellow/20 rounded-lg p-3">
            <div className="text-xs text-yellow font-medium mb-2">Clarification needed:</div>
            <ul className="list-disc list-inside text-sm text-text-dim space-y-1">
              {pendingClarifications.map((q, i) => (
                <li key={i}>{q}</li>
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

      {/* Input */}
      <div className="bg-surface border-t border-border p-4 shrink-0">
        <div className="flex gap-2">
          <input
            className="flex-1 bg-bg border border-border rounded-lg px-4 py-2.5 text-sm text-text placeholder-gray-500 focus:outline-none focus:border-accent"
            placeholder={pendingClarifications.length > 0 ? 'Answer the clarification...' : 'Type a message...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={sending}
            autoFocus
          />
          <button
            type="button"
            className={cn(
              'px-4 py-2.5 rounded-lg font-medium text-sm transition-colors',
              input.trim() && !sending
                ? 'bg-accent text-white hover:bg-accent/80'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed',
            )}
            onClick={handleSend}
            disabled={!input.trim() || sending}
          >
            <Send size={16} />
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
            {message.toolsUsed.map((t, i) => (
              <span key={i} className="px-1.5 py-0.5 text-xs rounded bg-purple/10 text-purple border border-purple/20">
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
