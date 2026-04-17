import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

type Json = unknown;

interface JsonViewProps {
  data: Json;
  /** Top-level keys are rendered as collapsible sections. Default: true. */
  collapsibleTopLevel?: boolean;
  /** Initial collapsed state for each top-level key. Default: all expanded. */
  defaultCollapsed?: boolean;
  className?: string;
}

/**
 * Lightweight syntax-highlighted JSON renderer. Zero dependencies.
 *
 * Top-level keys collapse individually so large configs (vinyan.json) stay
 * navigable without a heavy editor. For leaf values, falls back to a dense
 * <pre> block.
 */
export function JsonView({
  data,
  collapsibleTopLevel = true,
  defaultCollapsed = false,
  className,
}: JsonViewProps) {
  const isObject = typeof data === 'object' && data !== null && !Array.isArray(data);

  if (!collapsibleTopLevel || !isObject) {
    return (
      <pre
        className={cn(
          'bg-bg rounded p-3 text-xs font-mono overflow-auto whitespace-pre',
          className,
        )}
      >
        <RenderValue value={data} indent={0} />
      </pre>
    );
  }

  const entries = Object.entries(data as Record<string, unknown>);

  return (
    <div className={cn('space-y-2', className)}>
      {entries.map(([key, value]) => (
        <SectionCard key={key} name={key} value={value} defaultCollapsed={defaultCollapsed} />
      ))}
    </div>
  );
}

function SectionCard({
  name,
  value,
  defaultCollapsed,
}: {
  name: string;
  value: unknown;
  defaultCollapsed: boolean;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const summary = useMemo(() => summarize(value), [value]);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    } catch {
      /* ignored */
    }
  };

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        {open ? (
          <ChevronDown size={14} className="text-text-dim shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-text-dim shrink-0" />
        )}
        <span className="font-mono text-sm font-medium text-accent">{name}</span>
        <span className="text-xs text-text-dim truncate">{summary}</span>
        <span className="ml-auto flex items-center gap-1">
          <span
            role="button"
            tabIndex={0}
            className="p-1 rounded text-text-dim hover:text-text hover:bg-white/5 cursor-pointer"
            onClick={copy}
            onKeyDown={(e) => {
              if (e.key === 'Enter') copy(e as unknown as React.MouseEvent);
            }}
            title="Copy section as JSON"
          >
            <Copy size={12} />
          </span>
        </span>
      </button>
      {open && (
        <pre className="px-3 pb-3 text-xs font-mono overflow-auto whitespace-pre bg-bg/50">
          <RenderValue value={value} indent={0} />
        </pre>
      )}
    </div>
  );
}

function summarize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value.length > 40 ? `${value.slice(0, 40)}…` : value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return `{${keys.length} key${keys.length !== 1 ? 's' : ''}${keys.length > 0 ? `: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''}` : ''}}`;
  }
  return typeof value;
}

function RenderValue({ value, indent }: { value: unknown; indent: number }): React.ReactElement {
  const pad = '  '.repeat(indent);

  if (value === null) {
    return <span className="text-text-dim">null</span>;
  }
  if (typeof value === 'string') {
    return <span className="text-green">"{escapeString(value)}"</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-yellow">{value}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="text-accent">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>;
    return (
      <>
        <span>[</span>
        {'\n'}
        {value.map((item, i) => (
          <span key={i}>
            {pad}
            {'  '}
            <RenderValue value={item} indent={indent + 1} />
            {i < value.length - 1 && <span>,</span>}
            {'\n'}
          </span>
        ))}
        {pad}
        <span>]</span>
      </>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span>{'{}'}</span>;
    return (
      <>
        <span>{'{'}</span>
        {'\n'}
        {entries.map(([k, v], i) => (
          <span key={k}>
            {pad}
            {'  '}
            <span className="text-accent">"{k}"</span>
            <span>: </span>
            <RenderValue value={v} indent={indent + 1} />
            {i < entries.length - 1 && <span>,</span>}
            {'\n'}
          </span>
        ))}
        {pad}
        <span>{'}'}</span>
      </>
    );
  }
  return <span>{String(value)}</span>;
}

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}
