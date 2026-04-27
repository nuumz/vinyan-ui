import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActionMenuItem {
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  buttonLabel?: string;
  align?: 'left' | 'right';
}

interface MenuPosition {
  top: number;
  left: number;
}

const MENU_WIDTH = 160; // matches min-w-40 (10rem at default 16px root)
const VIEWPORT_PADDING = 8;

/**
 * Minimal headless action menu — popover anchored to a "kebab" trigger.
 * Renders the popup through a portal with `position: fixed` so it escapes
 * any ancestor with `overflow: hidden` / `clip` (the sessions/skills/etc.
 * tables all wrap rows in `overflow-hidden` for rounded corners). Closing
 * happens on outside click, Escape, scroll, or resize.
 */
export function ActionMenu({ items, buttonLabel = 'Open actions', align = 'right' }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const top = rect.bottom + 4;
    let left: number;
    if (align === 'right') {
      left = rect.right - MENU_WIDTH;
    } else {
      left = rect.left;
    }
    // Clamp to viewport so the menu stays visible if the trigger is
    // very close to a screen edge.
    const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING;
    if (left > maxLeft) left = maxLeft;
    if (left < VIEWPORT_PADDING) left = VIEWPORT_PADDING;
    setPosition({ top, left });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReflow = () => setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    // Closing on scroll/resize is simpler and more reliable than chasing
    // the trigger; the user can re-open the menu trivially.
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ position: 'fixed', top: position.top, left: position.left, width: MENU_WIDTH }}
              className={cn(
                'z-50 bg-surface border border-border rounded shadow-lg py-1',
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={`${item.label}-${idx}`}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return;
                      setOpen(false);
                      item.onClick();
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                      item.danger
                        ? 'text-red hover:bg-red/10'
                        : 'text-text hover:bg-white/5',
                    )}
                  >
                    {Icon && <Icon size={12} className="shrink-0" />}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
