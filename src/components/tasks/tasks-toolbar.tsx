import { Search, X } from 'lucide-react';
import type { ListTasksParams } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface TasksToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  routingLevel: number | undefined;
  onRoutingLevelChange: (value: number | undefined) => void;
  source: 'ui' | 'api' | 'all';
  onSourceChange: (value: 'ui' | 'api' | 'all') => void;
  approach: string;
  onApproachChange: (value: string) => void;
  hasError: boolean;
  onHasErrorChange: (value: boolean) => void;
  sort: NonNullable<ListTasksParams['sort']>;
  onSortChange: (value: NonNullable<ListTasksParams['sort']>) => void;
  pageSize: number;
  onPageSizeChange: (value: number) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}

/**
 * Filter row for the operations console. Wraps onto two lines on
 * narrower viewports — every input is dense (h-7) so the page can stay
 * work-focused rather than form-focused.
 */
export function TasksToolbar(props: TasksToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <div className="relative flex-1 min-w-[180px]">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-dim" />
        <input
          type="search"
          value={props.search}
          onChange={(e) => props.onSearchChange(e.target.value)}
          placeholder="Search goal, task id, session id, model, error…"
          className="w-full bg-surface border border-border rounded pl-7 pr-2 py-1 h-7 text-xs text-text placeholder-gray-500 focus:outline-none focus:border-accent"
        />
      </div>

      <Select
        label="Route"
        value={props.routingLevel === undefined ? '' : String(props.routingLevel)}
        onChange={(v) => props.onRoutingLevelChange(v === '' ? undefined : parseInt(v, 10))}
        options={[
          { label: 'Any route', value: '' },
          { label: 'L0 reflex', value: '0' },
          { label: 'L1 heuristic', value: '1' },
          { label: 'L2 analytical', value: '2' },
          { label: 'L3 deliberative', value: '3' },
        ]}
      />

      <Select
        label="Source"
        value={props.source}
        onChange={(v) => props.onSourceChange(v as 'ui' | 'api' | 'all')}
        options={[
          { label: 'All sources', value: 'all' },
          { label: 'UI / Chat', value: 'ui' },
          { label: 'API / async', value: 'api' },
        ]}
      />

      <input
        type="text"
        value={props.approach}
        onChange={(e) => props.onApproachChange(e.target.value)}
        placeholder="Approach…"
        className="bg-surface border border-border rounded px-2 py-1 h-7 text-xs w-[120px] text-text placeholder-gray-500 focus:outline-none focus:border-accent"
      />

      <Select
        label="Sort"
        value={props.sort}
        onChange={(v) => props.onSortChange(v as NonNullable<ListTasksParams['sort']>)}
        options={[
          { label: 'Newest first', value: 'created-desc' },
          { label: 'Oldest first', value: 'created-asc' },
          { label: 'Recently updated', value: 'updated-desc' },
          { label: 'Stalest first', value: 'updated-asc' },
        ]}
      />

      <Select
        label="Page size"
        value={String(props.pageSize)}
        onChange={(v) => props.onPageSizeChange(parseInt(v, 10))}
        options={[
          { label: '25', value: '25' },
          { label: '50', value: '50' },
          { label: '100', value: '100' },
          { label: '200', value: '200' },
        ]}
      />

      <label className="inline-flex items-center gap-1.5 select-none">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-accent"
          checked={props.hasError}
          onChange={(e) => props.onHasErrorChange(e.target.checked)}
        />
        <span className="text-text-dim">Has error</span>
      </label>

      {props.hasActiveFilters && (
        <button
          type="button"
          onClick={props.onClear}
          className="inline-flex items-center gap-1 text-text-dim hover:text-text px-2 py-1 rounded hover:bg-white/5"
        >
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
}

function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'bg-surface border border-border rounded px-2 py-1 h-7 text-xs text-text focus:outline-none focus:border-accent',
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
