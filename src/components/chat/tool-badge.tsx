import { FileText, Pencil, Search, Terminal, FolderOpen, Globe, Database, ListChecks, Send, GitBranch, Wrench } from 'lucide-react';
import type { ComponentType } from 'react';
import { classifyTool, toolBadgeLabel, type ToolCategory } from '@/lib/summarize-tools';
import { cn } from '@/lib/utils';

const ICON_BY_CAT: Record<ToolCategory, ComponentType<{ size?: number; className?: string }>> = {
  read: FileText,
  edit: Pencil,
  shell: Terminal,
  search: Search,
  list: FolderOpen,
  fetch: Globe,
  memory: Database,
  plan: ListChecks,
  delegate: Send,
  git: GitBranch,
  other: Wrench,
};

/**
 * Tone classes per category — subtle background + accent text so the badge
 * reads at a glance without dominating the row.
 */
const TONE_BY_CAT: Record<ToolCategory, string> = {
  read: 'bg-accent/10 text-accent border-accent/20',
  edit: 'bg-purple/10 text-purple border-purple/20',
  shell: 'bg-yellow/10 text-yellow border-yellow/20',
  search: 'bg-green/10 text-green border-green/20',
  list: 'bg-accent/10 text-accent border-accent/20',
  fetch: 'bg-purple/10 text-purple border-purple/20',
  memory: 'bg-text-dim/10 text-text-dim border-text-dim/20',
  plan: 'bg-yellow/10 text-yellow border-yellow/20',
  delegate: 'bg-purple/10 text-purple border-purple/20',
  git: 'bg-green/10 text-green border-green/20',
  other: 'bg-surface-2 text-text-dim border-border',
};

interface ToolBadgeProps {
  name: string;
  className?: string;
}

/** Compact category badge: icon + friendly label (Read / Bash / Search / ...). */
export function ToolBadge({ name, className }: ToolBadgeProps) {
  const cat = classifyTool(name);
  const Icon = ICON_BY_CAT[cat];
  return (
    <span
      title={name}
      className={cn(
        'inline-flex items-center gap-1 h-5 px-1.5 rounded border font-medium text-[10px] uppercase tracking-wide shrink-0',
        TONE_BY_CAT[cat],
        className,
      )}
    >
      <Icon size={10} />
      {toolBadgeLabel(name)}
    </span>
  );
}
