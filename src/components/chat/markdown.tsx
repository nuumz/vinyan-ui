import { useState, memo } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = String(children ?? '').replace(/\n$/, '');
  const lang = className?.replace('language-', '') ?? '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="relative group my-2">
      {lang && (
        <div className="absolute top-1.5 left-2 text-[10px] text-text-dim font-mono uppercase tracking-wide">
          {lang}
        </div>
      )}
      <button
        type="button"
        onClick={copy}
        className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-border/50 opacity-0 group-hover:opacity-100 transition-opacity text-text-dim"
        aria-label="Copy code"
      >
        {copied ? <Check size={12} className="text-green" /> : <Copy size={12} />}
      </button>
      <pre className={cn('bg-bg border border-border rounded-md p-3 pt-6 overflow-auto text-xs')}>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

interface MarkdownProps {
  content: string;
  className?: string;
}

/**
 * Render markdown with GFM (tables, strikethrough, task lists), highlight.js
 * for fenced code blocks, and a copy button on each block. Intentionally
 * applied only to assistant content — user input stays plain text.
 */
export const Markdown = memo(function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn('prose-chat', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
          code: ({ className, children, ...rest }: { className?: string; children?: ReactNode }) => {
            const isBlock = className?.startsWith('language-');
            if (isBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }
            return (
              <code
                className="px-1 py-0.5 rounded bg-bg border border-border font-mono text-[0.85em]"
                {...rest}
              >
                {children}
              </code>
            );
          },
          a: ({ children, ...rest }: { children?: ReactNode; href?: string }) => (
            <a
              {...rest}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {children}
            </a>
          ),
          h1: ({ children }: { children?: ReactNode }) => <h3 className="text-sm font-semibold mt-3 mb-1">{children}</h3>,
          h2: ({ children }: { children?: ReactNode }) => <h4 className="text-sm font-semibold mt-3 mb-1">{children}</h4>,
          h3: ({ children }: { children?: ReactNode }) => <h5 className="text-sm font-medium mt-2 mb-1">{children}</h5>,
          ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc pl-5 space-y-0.5 my-1.5">{children}</ul>,
          ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal pl-5 space-y-0.5 my-1.5">{children}</ol>,
          p: ({ children }: { children?: ReactNode }) => <p className="my-1.5 leading-relaxed">{children}</p>,
          blockquote: ({ children }: { children?: ReactNode }) => (
            <blockquote className="border-l-2 border-border pl-3 my-2 text-text-dim italic">
              {children}
            </blockquote>
          ),
          table: ({ children }: { children?: ReactNode }) => (
            <div className="overflow-auto my-2">
              <table className="text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }: { children?: ReactNode }) => (
            <th className="border border-border px-2 py-1 bg-surface-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }: { children?: ReactNode }) => <td className="border border-border px-2 py-1">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
