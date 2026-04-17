import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  path: string;
  group: string;
  keywords?: string[];
}

const COMMANDS: CommandItem[] = [
  // Runtime
  { id: 'overview', label: 'Overview', group: 'Runtime', path: '/', keywords: ['dashboard', 'home'] },
  { id: 'tasks', label: 'Tasks', group: 'Runtime', path: '/tasks', keywords: ['task', 'submit', 'run'] },
  { id: 'approvals', label: 'Approvals', group: 'Runtime', path: '/approvals', keywords: ['approve', 'high-risk'] },
  { id: 'sessions', label: 'Sessions', group: 'Runtime', path: '/sessions', keywords: ['chat', 'conversation'] },
  { id: 'events', label: 'Events', group: 'Runtime', path: '/events', keywords: ['sse', 'stream'] },
  { id: 'trace', label: 'Trace', group: 'Runtime', path: '/trace', keywords: ['log', 'history'] },
  // Fleet
  { id: 'engines', label: 'Engines', group: 'Fleet', path: '/engines', keywords: ['worker', 'llm', 'model'] },
  { id: 'agents', label: 'Agents', group: 'Fleet', path: '/agents', keywords: ['specialist', 'soul', 'persona'] },
  { id: 'peers', label: 'Peers', group: 'Fleet', path: '/peers', keywords: ['a2a', 'trust'] },
  { id: 'mcp', label: 'MCP', group: 'Fleet', path: '/mcp', keywords: ['tool', 'server'] },
  // Knowledge
  { id: 'skills', label: 'Skills', group: 'Knowledge', path: '/skills', keywords: ['cached', 'approach'] },
  { id: 'patterns', label: 'Patterns', group: 'Knowledge', path: '/patterns', keywords: ['extracted'] },
  { id: 'world-graph', label: 'World Graph', group: 'Knowledge', path: '/world-graph', keywords: ['facts'] },
  { id: 'memory', label: 'Memory', group: 'Knowledge', path: '/memory', keywords: ['lessons', 'proposals', 'review'] },
  // Evolution
  { id: 'rules', label: 'Rules', group: 'Evolution', path: '/rules', keywords: ['evolutionary'] },
  { id: 'oracles', label: 'Oracles', group: 'Evolution', path: '/oracles', keywords: ['ast', 'type', 'test', 'lint'] },
  { id: 'sleep-cycle', label: 'Sleep Cycle', group: 'Evolution', path: '/sleep-cycle', keywords: ['cycle'] },
  { id: 'shadow', label: 'Shadow Queue', group: 'Evolution', path: '/shadow', keywords: ['validation', 'async'] },
  { id: 'calibration', label: 'Calibration', group: 'Evolution', path: '/calibration', keywords: ['brier', 'prediction'] },
  { id: 'hms', label: 'HMS', group: 'Evolution', path: '/hms', keywords: ['hallucination', 'risk'] },
  // Economy
  { id: 'economy', label: 'Economy', group: 'Economy', path: '/economy', keywords: ['budget', 'cost'] },
  { id: 'providers', label: 'Provider Trust', group: 'Economy', path: '/providers', keywords: ['reliability', 'llm'] },
  { id: 'federation', label: 'Federation', group: 'Economy', path: '/federation', keywords: ['pool', 'a2a', 'budget'] },
  { id: 'market', label: 'Market', group: 'Economy', path: '/market', keywords: ['auction', 'vickrey', 'bid'] },
  // System
  { id: 'metrics', label: 'Metrics', group: 'System', path: '/metrics', keywords: ['prometheus'] },
  { id: 'doctor', label: 'Doctor', group: 'System', path: '/doctor', keywords: ['health', 'check'] },
  { id: 'config', label: 'Config', group: 'System', path: '/config', keywords: ['settings', 'vinyan.json'] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => {
      const haystack = [c.label, c.group, ...(c.keywords ?? [])].join(' ').toLowerCase();
      return q.split(/\s+/).every((tok) => haystack.includes(tok));
    });
  }, [query]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group)!.push(item);
    }
    return groups;
  }, [filtered]);

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[selected];
      if (item) go(item.path);
    }
  };

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-24">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div className="relative bg-surface border border-border rounded-lg w-[36rem] max-w-[90vw] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search size={14} className="text-text-dim" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to page…"
            className="flex-1 py-3 bg-transparent text-sm focus:outline-none"
          />
          <kbd className="text-xs text-text-dim bg-bg px-1.5 py-0.5 rounded border border-border">
            ESC
          </kbd>
        </div>
        <div className="max-h-[24rem] overflow-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-text-dim text-center">No matches</div>
          ) : (
            Array.from(grouped.entries()).map(([group, items]) => (
              <div key={group} className="mb-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-text-dim/60">
                  {group}
                </div>
                {items.map((item) => {
                  const idx = flatIndex++;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(item.path)}
                      onMouseEnter={() => setSelected(idx)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded transition-colors',
                        idx === selected ? 'bg-accent/10 text-accent' : 'text-text hover:bg-white/5',
                      )}
                    >
                      <span className="flex-1">{item.label}</span>
                      <code className="text-xs text-text-dim">{item.path}</code>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-text-dim">
          <div className="flex gap-3">
            <span>
              <kbd className="bg-bg px-1 rounded border border-border">↑</kbd>
              <kbd className="bg-bg px-1 rounded border border-border ml-0.5">↓</kbd> navigate
            </span>
            <span>
              <kbd className="bg-bg px-1 rounded border border-border">↵</kbd> open
            </span>
          </div>
          <span>
            <kbd className="bg-bg px-1 rounded border border-border">⌘K</kbd> toggle
          </span>
        </div>
      </div>
    </div>
  );
}
