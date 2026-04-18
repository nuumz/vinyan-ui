/**
 * Small clickable file-path chip. Shows basename with full path on hover.
 *
 * Copilot Chat-style: makes tool-call file references scannable without
 * drilling into raw JSON. Tries to open via custom "vinyan:openFile" event
 * if a host listener is registered; otherwise no-op.
 */
import { FileText } from 'lucide-react';
import { basename } from '@/lib/parse-tool-args';
import { cn } from '@/lib/utils';

interface FileChipProps {
  path: string;
  className?: string;
}

export function FileChip({ path, className }: FileChipProps) {
  const label = basename(path);

  const handleClick = () => {
    // Fire a window-level event so future host integrations (VS Code extension,
    // desktop shell) can pick it up and route to a file viewer. In the browser
    // dev environment this is a no-op.
    try {
      window.dispatchEvent(new CustomEvent('vinyan:openFile', { detail: { path } }));
    } catch {
      /* ignored */
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={path}
      className={cn(
        'inline-flex items-center gap-1 h-5 px-1.5 rounded bg-accent/5 hover:bg-accent/10 border border-accent/20 text-accent text-[10px] font-mono leading-none transition-colors',
        className,
      )}
    >
      <FileText size={10} className="shrink-0 opacity-70" />
      <span className="truncate max-w-[12rem]">{label}</span>
    </button>
  );
}
