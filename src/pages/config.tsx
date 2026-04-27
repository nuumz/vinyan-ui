import { useState } from 'react';
import { RefreshCw, FileCheck2, FileWarning } from 'lucide-react';
import { useConfig, useValidateConfig } from '@/hooks/use-config';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { JsonView } from '@/components/ui/json-view';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

export default function Config() {
  const configQuery = useConfig();
  const validate = useValidateConfig();
  const [validationResult, setValidationResult] = useState<
    { valid: boolean; errors?: Array<{ path: string; message: string }> } | null
  >(null);

  const config = configQuery.data;

  const runValidation = async () => {
    if (!config) return;
    try {
      const result = await validate.mutateAsync(config);
      setValidationResult(result);
      if (result.valid) {
        toast.success('Config is valid');
      } else {
        const count = result.errors?.length ?? 0;
        const first = result.errors?.[0];
        toast.error(`${count} validation error${count === 1 ? '' : 's'}`, {
          hint: first ? `${first.path}: ${first.message}` : undefined,
        });
      }
    } catch {
      /* onError already toasts */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Config"
        description="Effective vinyan.json (merged with schema defaults) — read-only view."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runValidation}
              disabled={!config || validate.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 disabled:opacity-50"
            >
              <FileCheck2 size={12} />
              Validate
            </button>
            <button
              type="button"
              onClick={() => configQuery.refetch()}
              disabled={configQuery.isFetching}
              className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={14} className={configQuery.isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        }
      />

      {configQuery.isLoading && <EmptyState message="Loading config…" />}

      {configQuery.error && (
        <div className="bg-red/10 border border-red/30 rounded p-3 text-sm text-red">
          {configQuery.error instanceof Error ? configQuery.error.message : 'Failed to load config'}
        </div>
      )}

      {validationResult && (
        <div
          className={cn(
            'rounded-lg border p-3 text-sm',
            validationResult.valid
              ? 'bg-green/5 border-green/30 text-green'
              : 'bg-red/5 border-red/30 text-red',
          )}
        >
          <div className="flex items-center gap-2">
            {validationResult.valid ? <FileCheck2 size={14} /> : <FileWarning size={14} />}
            <span className="font-medium">
              {validationResult.valid
                ? 'Valid'
                : `${validationResult.errors?.length ?? 0} validation error(s)`}
            </span>
            <Badge variant={validationResult.valid ? 'success' : 'error'} className="ml-auto">
              {validationResult.valid ? 'pass' : 'fail'}
            </Badge>
          </div>
          {validationResult.errors && validationResult.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {validationResult.errors.map((e, i) => (
                <li key={i} className="font-mono">
                  <span className="text-text-dim">{e.path || '<root>'}</span>
                  <span className="mx-2">—</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {config && <JsonView data={config} collapsibleTopLevel defaultCollapsed={false} />}

      <div className="text-xs text-text-dim">
        Config editing via UI is not yet supported. To modify, edit
        <code className="mx-1 px-1 bg-bg rounded">vinyan.json</code>and restart the server, or run
        <code className="mx-1 px-1 bg-bg rounded">vinyan config validate</code>.
      </div>
    </div>
  );
}
