interface EmptyStateProps {
  message: string;
  hint?: string;
}

export function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <div className="text-center py-8">
      <div className="text-sm text-text-dim">{message}</div>
      {hint && (
        <div className="text-xs text-text-dim mt-1">
          <code className="bg-bg px-1 rounded">{hint}</code>
        </div>
      )}
    </div>
  );
}
