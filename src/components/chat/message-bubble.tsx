import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ConversationEntry } from '@/lib/api-client';
import { Markdown } from './markdown';

export function MessageBubble({ message }: { message: ConversationEntry }) {
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
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <Markdown content={message.content} />
        )}

        {message.thinking && (
          <div className="mt-2 border-t border-border/50 pt-2">
            <button
              type="button"
              className="text-xs text-text-dim hover:text-text transition-colors"
              onClick={() => setShowThinking(!showThinking)}
            >
              {showThinking ? 'Hide thinking' : 'Show thinking'}
            </button>
            {showThinking && (
              <pre className="mt-1 text-xs text-text-dim bg-bg/50 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                {message.thinking}
              </pre>
            )}
          </div>
        )}

        {message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.toolsUsed.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 text-xs rounded bg-purple/10 text-purple border border-purple/20"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="text-xs text-text-dim mt-1.5">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
