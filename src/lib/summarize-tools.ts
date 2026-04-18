/**
 * Summarize tool calls into Claude Code-style sentences and helpers for
 * per-card friendly labels.
 */
import type { ToolCall } from '@/hooks/use-streaming-turn';

export type ToolCategory =
  | 'read'
  | 'edit'
  | 'shell'
  | 'search'
  | 'list'
  | 'fetch'
  | 'memory'
  | 'plan'
  | 'delegate'
  | 'git'
  | 'other';

const CATEGORY_RULES: Array<{ test: (n: string) => boolean; cat: ToolCategory }> = [
  { test: (n) => n === 'file_read' || n === 'read_file' || n === 'read', cat: 'read' },
  {
    test: (n) =>
      n === 'file_write' ||
      n === 'file_edit' ||
      n === 'create_file' ||
      n.startsWith('replace_string') ||
      n.startsWith('multi_replace_string') ||
      n === 'edit_notebook_file',
    cat: 'edit',
  },
  {
    test: (n) =>
      n === 'shell' ||
      n === 'bash' ||
      n === 'run_in_terminal' ||
      n === 'shell_exec' ||
      n.startsWith('shell_'),
    cat: 'shell',
  },
  {
    test: (n) => n.startsWith('search_') || n === 'grep_search' || n === 'file_search',
    cat: 'search',
  },
  { test: (n) => n === 'directory_list' || n === 'list_dir', cat: 'list' },
  { test: (n) => n.startsWith('http_') || n === 'fetch_webpage', cat: 'fetch' },
  { test: (n) => n.startsWith('memory_') || n === 'memory', cat: 'memory' },
  { test: (n) => n === 'plan_update' || n.startsWith('plan_'), cat: 'plan' },
  {
    test: (n) => n === 'delegate_task' || n === 'consult_peer' || n.startsWith('delegate_'),
    cat: 'delegate',
  },
  { test: (n) => n.startsWith('git_'), cat: 'git' },
];

export function classifyTool(name: string): ToolCategory {
  const lower = name.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.test(lower)) return rule.cat;
  }
  return 'other';
}

export function toolBadgeLabel(name: string): string {
  switch (classifyTool(name)) {
    case 'read':
      return 'Read';
    case 'edit':
      return 'Edit';
    case 'shell':
      return 'Bash';
    case 'search':
      return 'Search';
    case 'list':
      return 'List';
    case 'fetch':
      return 'Fetch';
    case 'git':
      return 'Git';
    case 'memory':
      return 'Memory';
    case 'plan':
      return 'Plan';
    case 'delegate':
      return 'Delegate';
    default:
      return name;
  }
}

const PRIMARY_KEYS_BY_CAT: Record<ToolCategory, string[]> = {
  read: ['path', 'filePath', 'file', 'filename', 'target'],
  edit: ['path', 'filePath', 'file', 'filename', 'target', 'targetFile'],
  shell: ['command', 'cmd', 'script'],
  search: ['query', 'pattern', 'regex', 'q'],
  list: ['path', 'directory', 'dir'],
  fetch: ['url', 'href', 'uri'],
  git: ['command', 'ref', 'path'],
  memory: ['path', 'key', 'query'],
  plan: ['title', 'description'],
  delegate: ['task', 'prompt', 'description', 'agent'],
  other: ['query', 'pattern', 'path', 'file', 'filePath', 'command', 'url'],
};

export function toolPrimaryPreview(name: string, args: unknown): string {
  if (args == null) return '';
  if (typeof args === 'string') return args;
  if (typeof args !== 'object' || Array.isArray(args)) return '';
  const rec = args as Record<string, unknown>;
  for (const k of PRIMARY_KEYS_BY_CAT[classifyTool(name)]) {
    const v = rec[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  for (const v of Object.values(rec)) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function label(cat: ToolCategory, count: number): string {
  const s = (n: number, sing: string, plur: string) => `${n} ${n === 1 ? sing : plur}`;
  switch (cat) {
    case 'read':
      return `Read ${s(count, 'file', 'files')}`;
    case 'edit':
      return `Edited ${s(count, 'file', 'files')}`;
    case 'shell':
      return `Ran ${s(count, 'command', 'commands')}`;
    case 'search':
      return `Searched ${s(count, 'pattern', 'patterns')}`;
    case 'list':
      return `Listed ${s(count, 'directory', 'directories')}`;
    case 'fetch':
      return `Fetched ${s(count, 'URL', 'URLs')}`;
    case 'memory':
      return `${s(count, 'memory op', 'memory ops')}`;
    case 'plan':
      return `Updated ${s(count, 'plan', 'plans')}`;
    case 'delegate':
      return `Delegated ${s(count, 'task', 'tasks')}`;
    case 'git':
      return `${s(count, 'git op', 'git ops')}`;
    case 'other':
      return s(count, 'tool call', 'tool calls');
  }
}

const CATEGORY_ORDER: ToolCategory[] = [
  'read',
  'edit',
  'shell',
  'search',
  'list',
  'fetch',
  'git',
  'memory',
  'plan',
  'delegate',
  'other',
];

export function summarizeToolCalls(tools: ToolCall[]): string | null {
  if (tools.length === 0) return null;
  const counts = new Map<ToolCategory, number>();
  for (const t of tools) {
    const c = classifyTool(t.name);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const n = counts.get(cat);
    if (n) parts.push(label(cat, n));
  }
  return parts
    .map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1)))
    .join(', ');
}
