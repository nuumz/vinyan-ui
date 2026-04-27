import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SessionMetadataDialogValue {
  title: string;
  description: string;
}

interface SessionMetadataDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: SessionMetadataDialogValue;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (value: SessionMetadataDialogValue) => void;
}

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 4000;

/**
 * Modal for capturing session title/description on create AND edit.
 * Strict client-side bounds match the server-side validation in
 * `handleUpdateSession` so the operator gets immediate feedback rather
 * than a 400 round-trip.
 */
export function SessionMetadataDialog({
  open,
  mode,
  initial,
  busy = false,
  onClose,
  onSubmit,
}: SessionMetadataDialogProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '');
      setDescription(initial?.description ?? '');
      // Defer focus until the next paint so the modal animation does not
      // steal the cursor.
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const titleTooLong = title.length > TITLE_MAX;
  const descriptionTooLong = description.length > DESCRIPTION_MAX;
  const canSubmit = !busy && !titleTooLong && !descriptionTooLong;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ title: title.trim(), description: description.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <form
        onSubmit={submit}
        className="relative bg-surface border border-border rounded-lg w-lg max-w-[92vw] p-5 shadow-xl space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">
              {mode === 'create' ? 'New session' : 'Edit session'}
            </h3>
            <p className="text-xs text-text-dim mt-1">
              Title and description help you and the agent identify this conversation. They are
              treated as auxiliary context only and do not change task routing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded text-text-dim hover:text-text hover:bg-white/5 disabled:opacity-50"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor="session-title" className="text-xs text-text-dim">
            Title
          </label>
          <input
            id="session-title"
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Refactor invoice import"
            disabled={busy}
            className={cn(
              'w-full px-2 py-1.5 text-sm rounded bg-bg border focus:outline-none focus:ring-1 focus:ring-accent/40',
              titleTooLong ? 'border-red/50' : 'border-border',
            )}
          />
          <div className="flex justify-between text-[10px] text-text-dim">
            <span>{titleTooLong ? `Max ${TITLE_MAX} characters` : 'Optional'}</span>
            <span className={cn(titleTooLong && 'text-red')}>
              {title.length}/{TITLE_MAX}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="session-description" className="text-xs text-text-dim">
            Description
          </label>
          <textarea
            id="session-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this session for? Any constraints or context the agent should remember…"
            disabled={busy}
            rows={5}
            className={cn(
              'w-full px-2 py-1.5 text-sm rounded bg-bg border focus:outline-none focus:ring-1 focus:ring-accent/40 resize-y',
              descriptionTooLong ? 'border-red/50' : 'border-border',
            )}
          />
          <div className="flex justify-between text-[10px] text-text-dim">
            <span>{descriptionTooLong ? `Max ${DESCRIPTION_MAX} characters` : 'Optional'}</span>
            <span className={cn(descriptionTooLong && 'text-red')}>
              {description.length}/{DESCRIPTION_MAX}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded border border-border text-text-dim hover:text-text hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-3 py-1.5 text-sm rounded border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : mode === 'create' ? 'Create session' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
