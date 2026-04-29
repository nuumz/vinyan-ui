import { cn } from '@/lib/utils';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
}

type TabsVariant = 'underline' | 'pills';

interface TabsProps<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  className?: string;
  variant?: TabsVariant;
}

export function Tabs<T extends string>({
  items,
  active,
  onChange,
  className,
  variant = 'underline',
}: TabsProps<T>) {
  if (variant === 'pills') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-0.5 p-0.5 rounded-md bg-surface-2/60 border border-border',
          className,
        )}
        role="tablist"
      >
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.id)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                isActive
                  ? 'bg-surface text-text ring-1 ring-border shadow-sm'
                  : 'text-text-dim hover:text-text',
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span className="ml-1.5 text-[10px] text-text-dim tabular-nums">{item.count}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1 border-b border-border', className)} role="tablist">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
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
