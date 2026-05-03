import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type CommandKind = 'navigate' | 'scroll-anchor' | 'help';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string[];
  kind?: CommandKind;
  /** For navigate commands. */
  path?: string;
  /** For scroll-anchor commands — DOM id to scrollIntoView. */
  anchor?: string;
  /** Restrict this command to specific route prefixes (e.g. session pages). */
  routePrefixes?: string[];
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
  // Session — scoped to /sessions/:id pages. The runtime gates these by
  // current route so they only appear when relevant.
  {
    id: 'session-task',
    label: 'Open task card',
    kind: 'scroll-anchor',
    anchor: 'taskcard',
    group: 'Session',
    keywords: ['identity', 'whats-left', 'cancel', 'retry'],
    routePrefixes: ['/sessions/'],
  },
  {
    id: 'session-plan',
    label: 'Open plan card',
    kind: 'scroll-anchor',
    anchor: 'plancard',
    group: 'Session',
    keywords: ['steps', 'workflow'],
    routePrefixes: ['/sessions/'],
  },
  {
    id: 'session-roster',
    label: 'Open agent roster',
    kind: 'scroll-anchor',
    anchor: 'agentroster',
    group: 'Session',
    keywords: ['delegate', 'sub-agent', 'fanout'],
    routePrefixes: ['/sessions/'],
  },
  {
    id: 'session-timeline',
    label: 'Open timeline',
    kind: 'scroll-anchor',
    anchor: 'timelinehistory',
    group: 'Session',
    keywords: ['process', 'history', 'audit'],
    routePrefixes: ['/sessions/'],
  },
  {
    id: 'session-gate',
    label: 'Jump to active gate',
    kind: 'scroll-anchor',
    anchor: 'interrupt-banner',
    group: 'Session',
    keywords: ['approval', 'human-input', 'partial-decision'],
    routePrefixes: ['/sessions/'],
  },
  {
    id: 'help-keyboard',
    label: 'Keyboard shortcuts',
    kind: 'help',
    group: 'Help',
    keywords: ['shortcut', 'binding', 'chord'],
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const scrollToAnchor = useCallback((anchor: string) => {
    const el = document.getElementById(anchor);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-accent/40', 'rounded-md');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-accent/40', 'rounded-md');
      }, 1200);
    }
  }, []);

  useEffect(() => {
    // Chord state — first 'g' arms a 600ms window for the second key.
    let chordTimer: ReturnType<typeof setTimeout> | null = null;
    let chordArmed = false;

    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target.isContentEditable
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        if (open) setOpen(false);
        if (helpOpen) setHelpOpen(false);
        return;
      }

      // Don't fire chord shortcuts while typing into an input.
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (chordArmed) {
        chordArmed = false;
        if (chordTimer) {
          clearTimeout(chordTimer);
          chordTimer = null;
        }
        const onSessionPage = location.pathname.startsWith('/sessions/');
        switch (e.key.toLowerCase()) {
          case 't':
            if (onSessionPage) {
              e.preventDefault();
              scrollToAnchor('timelinehistory');
            }
            break;
          case 'p':
            if (onSessionPage) {
              e.preventDefault();
              scrollToAnchor('plancard');
            }
            break;
          case 'r':
            if (onSessionPage) {
              e.preventDefault();
              scrollToAnchor('agentroster');
            }
            break;
          case 'k':
            if (onSessionPage) {
              e.preventDefault();
              scrollToAnchor('taskcard');
            }
            break;
        }
        return;
      }

      if (e.key.toLowerCase() === 'g') {
        chordArmed = true;
        chordTimer = setTimeout(() => {
          chordArmed = false;
          chordTimer = null;
        }, 600);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (chordTimer) clearTimeout(chordTimer);
    };
  }, [open, helpOpen, location.pathname, scrollToAnchor]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const visibleByRoute = useMemo(() => {
    return COMMANDS.filter((c) => {
      if (!c.routePrefixes || c.routePrefixes.length === 0) return true;
      return c.routePrefixes.some((p) => location.pathname.startsWith(p));
    });
  }, [location.pathname]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleByRoute;
    return visibleByRoute.filter((c) => {
      const haystack = [c.label, c.group, ...(c.keywords ?? [])].join(' ').toLowerCase();
      return q.split(/\s+/).every((tok) => haystack.includes(tok));
    });
  }, [query, visibleByRoute]);

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

  const run = (item: CommandItem) => {
    setOpen(false);
    if (item.kind === 'scroll-anchor' && item.anchor) {
      // Yield to the close transition so the palette doesn't repaint over
      // the highlighted target.
      setTimeout(() => scrollToAnchor(item.anchor!), 0);
      return;
    }
    if (item.kind === 'help') {
      setHelpOpen(true);
      return;
    }
    if (item.path) navigate(item.path);
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
      if (item) run(item);
    }
  };

  if (!open && !helpOpen) return null;

  let flatIndex = 0;

  if (!open && helpOpen) {
    return <KeyboardHelpModal onClose={() => setHelpOpen(false)} />;
  }

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
                  const trail =
                    item.kind === 'scroll-anchor'
                      ? `#${item.anchor}`
                      : item.kind === 'help'
                        ? '?'
                        : (item.path ?? '');
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => run(item)}
                      onMouseEnter={() => setSelected(idx)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded transition-colors',
                        idx === selected ? 'bg-accent/10 text-accent' : 'text-text hover:bg-white/5',
                      )}
                    >
                      <span className="flex-1">{item.label}</span>
                      <code className="text-xs text-text-dim">{trail}</code>
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
            <span>
              <kbd className="bg-bg px-1 rounded border border-border">?</kbd> help
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

interface KeyboardHelpModalProps {
  onClose: () => void;
}

function KeyboardHelpModal({ onClose }: KeyboardHelpModalProps) {
  const groups: Array<{ title: string; rows: Array<[string, string]> }> = [
    {
      title: 'Global',
      rows: [
        ['⌘ / Ctrl + K', 'Open command palette'],
        ['?', 'Open this help'],
        ['Esc', 'Close palette / dialog'],
      ],
    },
    {
      title: 'Session (chord, prefix g)',
      rows: [
        ['g k', 'Jump to task card'],
        ['g p', 'Jump to plan card'],
        ['g r', 'Jump to agent roster'],
        ['g t', 'Jump to timeline'],
      ],
    },
    {
      title: 'Composer',
      rows: [
        ['Enter', 'Send message'],
        ['Shift + Enter', 'Newline'],
      ],
    },
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-24">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-surface border border-border rounded-lg w-[28rem] max-w-[90vw] shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium">Keyboard shortcuts</span>
          <kbd className="text-xs text-text-dim bg-bg px-1.5 py-0.5 rounded border border-border">
            ESC
          </kbd>
        </div>
        <div className="px-4 py-3 space-y-3 max-h-[24rem] overflow-auto">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] uppercase tracking-wider text-text-dim/60 mb-1">
                {g.title}
              </div>
              <div className="space-y-1">
                {g.rows.map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <code className="bg-bg px-1.5 py-0.5 rounded border border-border font-mono">
                      {key}
                    </code>
                    <span className="text-text-dim">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
