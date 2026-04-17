import { cn } from '@/lib/utils';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ items, active, onChange, className }: TabsProps<T>) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-border', className)}>
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'px-3 py-2 text-sm transition-colors border-b-2 -mb-px',
              isActive
                ? 'text-accent border-accent'
                : 'text-text-dim border-transparent hover:text-text',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="ml-1.5 text-xs text-text-dim tabular-nums">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
