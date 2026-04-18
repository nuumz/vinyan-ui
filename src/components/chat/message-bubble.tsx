import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationEntry } from '@/lib/api-client';
import { Markdown } from './markdown';

const INPUT_REQUIRED_TAG = '[INPUT-REQUIRED]';

function parseInputRequiredBlock(content: string): { preamble: string; questions: string[] } | null {
  const tagIdx = content.indexOf(INPUT_REQUIRED_TAG);
  if (tagIdx === -1) return null;
  const preamble = content.slice(0, tagIdx).trimEnd();
  const body = content.slice(tagIdx + INPUT_REQUIRED_TAG.length);
  const questions: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      const q = trimmed.slice(2).trim();
      if (q) questions.push(q);
    } else if (trimmed.length > 0 && questions.length > 0) {
      break;
    }
  }
  return { preamble, questions };
}

export function MessageBubble({ message }: { message: ConversationEntry }) {
  const isUser = message.role === 'user';
  const [showThinking, setShowThinking] = useState(false);
  const clarification = !isUser ? parseInputRequiredBlock(message.content) : null;

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
          <div className="whitespace-pre-wrap wrap-break-word">{message.content}</div>
        ) : clarification ? (
          <div className="space-y-2">
            {clarification.preamble && <Markdown content={clarification.preamble} />}
            {clarification.questions.length > 0 && (
              <div className="bg-yellow/5 border border-yellow/20 rounded-md p-2.5">
                <div className="flex items-center gap-1.5 text-xs text-yellow font-medium mb-1.5">
                  <HelpCircle size={12} /> Clarification needed
                </div>
                <ul className="list-disc list-inside text-sm text-text-dim space-y-1">
                  {clarification.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
