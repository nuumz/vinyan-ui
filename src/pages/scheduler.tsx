import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Pause, Play, Play as Run, RefreshCw, Trash2 } from 'lucide-react';
import {
  useCreateScheduledJob,
  useDeleteScheduledJob,
  usePauseScheduledJob,
  useResumeScheduledJob,
  useRunScheduledJobNow,
  useScheduledJobs,
} from '@/hooks/use-scheduler';
import type { ScheduledJob } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CardSkeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm';
import { toast } from '@/store/toast-store';

type TabId = 'all' | 'active' | 'paused' | 'failed-circuit' | 'expired';

const TAB_ITEMS: ReadonlyArray<TabItem<TabId>> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'failed-circuit', label: 'Failed' },
  { id: 'expired', label: 'Expired' },
];

/**
 * Scheduler operations console.
 *
 * Backs `gateway_schedules` (mig 006) — durable agent cron. Each job
 * fires `executeTask` with `source: 'gateway-cron'`. Recursion guard
 * prevents scheduled tasks from mutating their own schedule.
 *
 * Page is a triage-first surface: status tabs → create form → job
 * list with per-row actions (pause / resume / run-now / delete).
 */
export default function Scheduler() {
  const [tab, setTab] = useState<TabId>('all');
  const [showForm, setShowForm] = useState(false);

  const params = tab === 'all' ? {} : { status: tab };
  const jobsQuery = useScheduledJobs(params);
  const total = jobsQuery.data?.total ?? 0;
  const jobs = jobsQuery.data?.jobs ?? [];

  return (
    <div className="space-y-3 pb-4">
      <PageHeader
        title="Scheduler"
        description={`${total} scheduled job${total === 1 ? '' : 's'} · profile: ${
          jobsQuery.data?.profile ?? 'default'
        }`}
        actions={
          <>
            <button
              type="button"
              className="p-1.5 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
              onClick={() => jobsQuery.refetch()}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw size={14} className={jobsQuery.isFetching ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded font-medium text-sm bg-accent text-white hover:bg-accent/80 transition-colors"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? 'Cancel' : 'New Job'}
            </button>
          </>
        }
      />

      {showForm && <CreateJobForm onClose={() => setShowForm(false)} />}

      <Tabs<TabId>
        items={TAB_ITEMS}
        active={tab}
        onChange={setTab}
        variant="pills"
      />

      {jobsQuery.isLoading ? (
        <div className="space-y-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          message={tab === 'all' ? 'No scheduled jobs' : `No jobs in '${tab}' state`}
          hint={tab === 'all' ? 'Click "New Job" to create a recurring agent task.' : undefined}
        />
      ) : (
        <div className="bg-surface rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-bg/50 border-b border-border">
              <tr className="text-left text-[10px] uppercase tracking-wider text-text-dim">
                <th className="px-3 py-2 font-medium">Goal</th>
                <th className="px-3 py-2 font-medium">Cron</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Next fire</th>
                <th className="px-3 py-2 font-medium">Last run</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function JobRow({ job }: { job: ScheduledJob }) {
  const pause = usePauseScheduledJob();
  const resume = useResumeScheduledJob();
  const runNow = useRunScheduledJobNow();
  const del = useDeleteScheduledJob();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isPaused = job.status === 'paused';
  const isCircuit = job.status === 'failed-circuit';
  const nextFire = job.nextFireAt ? formatRelative(job.nextFireAt) : '—';
  const lastRun = job.lastRun
    ? `${formatRelative(job.lastRun.ranAt)} (${job.lastRun.outcome})`
    : '—';

  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-white/2">
      <td className="px-3 py-2 max-w-[28ch]">
        <div className="text-text truncate" title={job.goal}>
          {job.goal}
        </div>
        <div className="text-[10px] text-text-dim truncate" title={job.nlOriginal}>
          {job.nlOriginal}
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-text-dim tabular-nums">
        <div>{job.cron}</div>
        <div className="text-[10px]">{job.timezone}</div>
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={job.status} />
        {job.failureStreak > 0 && (
          <div className="text-[10px] text-text-dim mt-0.5">streak: {job.failureStreak}</div>
        )}
      </td>
      <td className="px-3 py-2 text-text-dim font-mono tabular-nums">{nextFire}</td>
      <td className="px-3 py-2 max-w-[28ch]">
        {job.lastRun ? (
          <Link
            to={`/tasks?search=${encodeURIComponent(job.lastRun.taskId)}`}
            className="text-text-dim hover:text-accent truncate block"
            title={`Last task: ${job.lastRun.taskId}`}
          >
            {lastRun}
          </Link>
        ) : (
          <span className="text-text-dim">—</span>
        )}
        <div className="text-[10px] text-text-dim">{job.runCount} run{job.runCount === 1 ? '' : 's'}</div>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex gap-1">
          <button
            type="button"
            onClick={() => {
              if (isPaused || isCircuit) {
                resume.mutate(job.id, {
                  onSuccess: () => toast.info('Job resumed'),
                });
              } else {
                pause.mutate(job.id, {
                  onSuccess: () => toast.info('Job paused'),
                });
              }
            }}
            className="p-1 rounded text-text-dim hover:text-text hover:bg-white/5 transition-colors"
            title={isPaused || isCircuit ? 'Resume' : 'Pause'}
            disabled={pause.isPending || resume.isPending}
          >
            {isPaused || isCircuit ? <Play size={12} /> : <Pause size={12} />}
          </button>
          <button
            type="button"
            onClick={() =>
              runNow.mutate(job.id, {
                onSuccess: (res) => toast.success(`Started task ${res.taskId.slice(0, 8)}…`),
              })
            }
            className="p-1 rounded text-text-dim hover:text-accent hover:bg-white/5 transition-colors"
            title="Run now"
            disabled={runNow.isPending}
          >
            <Run size={12} />
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="p-1 rounded text-text-dim hover:text-red hover:bg-white/5 transition-colors"
            title="Delete"
            disabled={del.isPending}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </td>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          del.mutate(job.id, {
            onSuccess: () => toast.info('Job deleted'),
          });
        }}
        title="Delete scheduled job?"
        description={
          <>
            This will remove <span className="font-medium">{job.goal}</span> permanently. This cannot
            be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        busy={del.isPending}
      />
    </tr>
  );
}

function CreateJobForm({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'cron' | 'nl'>('nl');
  const [goal, setGoal] = useState('');
  const [cron, setCron] = useState('');
  const [nl, setNl] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const create = useCreateScheduledJob();

  const handleSubmit = async () => {
    if (!goal.trim()) {
      toast.error('Goal is required');
      return;
    }
    const body =
      mode === 'cron'
        ? { goal, cron, timezone }
        : { goal, nl, timezone };
    if (mode === 'cron' && !cron.trim()) {
      toast.error('Cron expression is required');
      return;
    }
    if (mode === 'nl' && !nl.trim()) {
      toast.error('Natural-language phrase is required');
      return;
    }
    try {
      await create.mutateAsync(body);
      toast.success('Scheduled job created');
      setGoal('');
      setCron('');
      setNl('');
      onClose();
    } catch {
      // toast handled by mutation
    }
  };

  return (
    <div className="bg-surface rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-text-dim">
        <Clock size={12} />
        <span>New scheduled job</span>
        <div className="ml-auto inline-flex rounded border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('nl')}
            className={`px-2 py-0.5 text-[10px] ${
              mode === 'nl' ? 'bg-accent text-white' : 'text-text-dim hover:bg-white/5'
            }`}
          >
            Natural language
          </button>
          <button
            type="button"
            onClick={() => setMode('cron')}
            className={`px-2 py-0.5 text-[10px] border-l border-border ${
              mode === 'cron' ? 'bg-accent text-white' : 'text-text-dim hover:bg-white/5'
            }`}
          >
            Cron
          </button>
        </div>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-text-dim block mb-1">Goal</label>
        <input
          className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs text-text placeholder-gray-500 focus:outline-none focus:border-accent"
          placeholder="e.g. summarize today's PR queue"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          autoFocus
        />
      </div>
      {mode === 'nl' ? (
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-dim block mb-1">
            When (natural language)
          </label>
          <input
            className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs text-text placeholder-gray-500 focus:outline-none focus:border-accent"
            placeholder="e.g. every weekday at 9am"
            value={nl}
            onChange={(e) => setNl(e.target.value)}
          />
          <p className="text-[10px] text-text-dim mt-1">
            Supports: "every weekday at 9am", "daily at 20:00", "every 30 minutes", "every monday at
            9:30", "at 14:00 on weekends".
          </p>
        </div>
      ) : (
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-dim block mb-1">
            Cron expression
          </label>
          <input
            className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs text-text font-mono placeholder-gray-500 focus:outline-none focus:border-accent"
            placeholder="0 9 * * 1-5"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
          />
          <p className="text-[10px] text-text-dim mt-1">
            Standard 5-field cron: <span className="font-mono">m h dom mon dow</span>.
          </p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-dim block mb-1">Timezone</label>
          <input
            className="bg-bg border border-border rounded px-2 py-1 h-7 text-xs text-text font-mono"
            placeholder="UTC"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="ml-auto px-3 py-1 h-7 rounded text-xs font-medium bg-green/20 text-green border border-green/30 hover:bg-green/30 transition-colors disabled:opacity-50"
          onClick={handleSubmit}
          disabled={create.isPending || !goal.trim()}
        >
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  );
}

/** Compact relative-time formatter — "2m ago" / "in 3h" / "—". */
function formatRelative(epochMs: number): string {
  const diff = epochMs - Date.now();
  const abs = Math.abs(diff);
  const sign = diff < 0 ? 'ago' : 'in';
  const m = Math.round(abs / 60_000);
  if (m < 1) return diff < 0 ? 'just now' : 'soon';
  if (m < 60) return `${sign === 'in' ? 'in ' : ''}${m}m${sign === 'ago' ? ' ago' : ''}`;
  const h = Math.round(abs / 3_600_000);
  if (h < 24) return `${sign === 'in' ? 'in ' : ''}${h}h${sign === 'ago' ? ' ago' : ''}`;
  const d = Math.round(abs / 86_400_000);
  return `${sign === 'in' ? 'in ' : ''}${d}d${sign === 'ago' ? ' ago' : ''}`;
}
