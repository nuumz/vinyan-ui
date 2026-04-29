import { useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
  Edit3,
  FileText,
  Loader2,
  Terminal,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StreamingTurn } from '@/hooks/use-streaming-turn';
import type { CodingCliSessionState, CodingCliToolEntry } from '@/hooks/coding-cli-state';
import { ProviderBadge, StateChip } from './coding-cli-shared';
import { CodingCliApprovalCard } from './coding-cli-approval-card';
import { CodingCliResult } from './coding-cli-result';

interface CodingCliCardProps {
  turn: StreamingTurn;
}

const TERMINAL_STATES = new Set([
  'completed',
  'failed',
  'cancelled',
  'timed-out',
  'crashed',
  'unsupported-capability',
]);

/**
 * External Coding CLI activity card.
 *
 * One row per active or recently-completed CLI session. Mirrors the
 * `AgentTimelineCard` structure (header chip + collapsible drawer per
 * row) but the unit is a *CLI session*, not a sub-agent. Key surfaces:
 *
 *   - Provider badge (Claude Code / GitHub Copilot) + state chip
 *   - Live tool/command activity (compact icons; expand for detail)
 *   - File-change count (full list inside drawer)
 *   - Pending approval card (inline; never blocks the rest of the bubble)
 *   - Decisions log (CLI's reported rationale; not Vinyan-verified)
 *   - Result envelope + Vinyan verification verdict (CodingCliResult)
 *   - Stalled / failed / cancelled banner
 *
 * The card is hidden when there are no sessions — same null-render
 * convention as the other StreamingBubble children.
 */
export function CodingCliCard({ turn }: CodingCliCardProps) {
  const sessions = Object.values(turn.codingCliSessions);
  if (sessions.length === 0) return null;
  // Most-recently-created last (chronological). The reducer doesn't
  // sort, so we sort here defensively.
  const ordered = [...sessions].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="border border-border rounded-md bg-surface-deep/30 overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-surface-deep/50 flex items-center gap-2">
        <Terminal size={12} className="text-text-dim shrink-0" />
        <span className="text-xs font-medium text-text">External Coding CLI</span>
        <span className="text-[11px] text-text-dim">
          {ordered.length} session{ordered.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="divide-y divide-border">
        {ordered.map((session) => (
          <CodingCliRow key={session.id} session={session} />
        ))}
      </div>
    </div>
  );
}

function CodingCliRow({ session }: { session: CodingCliSessionState }) {
  const [expanded, setExpanded] = useState(false);
  const isLive = !TERMINAL_STATES.has(session.state) && !session.cancelled;
  const isFailed = session.state === 'failed' || session.state === 'crashed' || session.state === 'timed-out';
  const isStalled = !!session.stalled && !TERMINAL_STATES.has(session.state);
  const tools = session.toolActivity;
  const runningTool = tools.find((t) => t.status === 'running');

  return (
    <div className="px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-2 text-left"
      >
        <ChevronRight
          size={12}
          className={cn(
            'text-text-dim shrink-0 mt-1 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <ProviderBadge providerId={session.providerId} size="xs" />
            <StateChip state={session.state} />
            {isLive && (
              <Loader2 size={11} className="text-blue animate-spin shrink-0" />
            )}
            {session.binaryVersion && (
              <span className="text-[10px] text-text-dim font-mono">
                v{session.binaryVersion}
              </span>
            )}
            {isStalled && (
              <span className="text-[10px] text-yellow font-medium inline-flex items-center gap-1">
                <AlertCircle size={10} /> stalled
              </span>
            )}
            {isFailed && (
              <span className="text-[10px] text-red font-medium inline-flex items-center gap-1">
                <AlertCircle size={10} /> failed
              </span>
            )}
          </div>
          <CompactActivityRow
            tools={tools}
            runningTool={runningTool}
            filesChanged={session.filesChanged.length}
            commandsRequested={session.commandsRequested.length}
          />
        </div>
      </button>

      {expanded && (
        <div className="mt-2 pl-5 space-y-2.5">
          {session.pendingApproval && (
            <CodingCliApprovalCard
              codingCliSessionId={session.id}
              providerId={session.providerId}
              pending={session.pendingApproval}
            />
          )}

          {session.toolActivity.length > 0 && (
            <ActivityList tools={session.toolActivity} />
          )}

          {session.filesChanged.length > 0 && (
            <ListSection
              title="Files changed"
              icon={<FileText size={11} className="text-text-dim" />}
              items={session.filesChanged}
            />
          )}

          {session.commandsRequested.length > 0 && (
            <ListSection
              title="Commands"
              icon={<Terminal size={11} className="text-text-dim" />}
              items={session.commandsRequested}
            />
          )}

          {session.decisions.length > 0 && (
            <DecisionsList decisions={session.decisions} />
          )}

          {session.failureReason && (
            <div className="text-[11px] text-red border border-red/30 bg-red/5 rounded p-2">
              {session.failureReason}
            </div>
          )}

          {session.cancelled && (
            <div className="text-[11px] text-text-dim italic border border-border rounded p-2">
              Cancelled by {session.cancelled.by}
              {session.cancelled.reason ? ` — ${session.cancelled.reason}` : ''}.
            </div>
          )}

          <CodingCliResult session={session} />

          <div className="text-[10px] text-text-dim font-mono">
            session: {session.id}
          </div>
        </div>
      )}
    </div>
  );
}

function CompactActivityRow({
  tools,
  runningTool,
  filesChanged,
  commandsRequested,
}: {
  tools: CodingCliToolEntry[];
  runningTool: CodingCliToolEntry | undefined;
  filesChanged: number;
  commandsRequested: number;
}) {
  const recent = tools.slice(-4);
  const completed = tools.filter((t) => t.status !== 'running').length;

  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px] text-text-dim">
      {runningTool && (
        <span className="inline-flex items-center gap-1 text-blue">
          <Wrench size={10} />
          {runningTool.toolName}
        </span>
      )}
      {!runningTool && recent.length > 0 && (
        <span className="inline-flex items-center gap-1">
          <Wrench size={10} />
          {completed} tool{completed === 1 ? '' : 's'}
        </span>
      )}
      {filesChanged > 0 && (
        <span className="inline-flex items-center gap-1">
          <FileText size={10} />
          {filesChanged} file{filesChanged === 1 ? '' : 's'}
        </span>
      )}
      {commandsRequested > 0 && (
        <span className="inline-flex items-center gap-1">
          <Terminal size={10} />
          {commandsRequested} cmd{commandsRequested === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}

function ActivityList({ tools }: { tools: CodingCliToolEntry[] }) {
  // Show last 12.
  const recent = tools.slice(-12);
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-text-dim font-medium uppercase tracking-wider">
        Tool activity
      </div>
      <ul className="space-y-0.5">
        {recent.map((t) => {
          const Icon = t.toolName.toLowerCase() === 'edit' || t.toolName.toLowerCase() === 'write'
            ? Edit3
            : t.toolName.toLowerCase() === 'bash' || t.toolName.toLowerCase() === 'shell'
              ? Terminal
              : Wrench;
          return (
            <li key={t.id} className="flex items-start gap-1.5 text-[11px]">
              {t.status === 'running' ? (
                <Loader2 size={11} className="text-blue shrink-0 mt-0.5 animate-spin" />
              ) : t.status === 'success' ? (
                <Icon size={11} className="text-text-dim shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={11} className="text-red shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-mono text-text">{t.toolName}</span>
                {t.summary && <span className="text-text-dim"> — {t.summary}</span>}
                {t.errorMessage && (
                  <span className="text-red"> — {t.errorMessage}</span>
                )}
              </div>
              {typeof t.durationMs === 'number' && (
                <span className="text-[10px] text-text-dim font-mono tabular-nums shrink-0">
                  {t.durationMs}ms
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {tools.length > recent.length && (
        <div className="text-[10px] text-text-dim">+ {tools.length - recent.length} earlier</div>
      )}
    </div>
  );
}

function ListSection({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
}) {
  const recent = items.slice(-12);
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-text-dim font-medium uppercase tracking-wider flex items-center gap-1.5">
        {icon}
        {title} ({items.length})
      </div>
      <ul className="space-y-0.5 max-h-40 overflow-y-auto">
        {recent.map((item, i) => (
          <li key={`${item}-${i}`} className="text-[11px] font-mono text-text wrap-break-word">
            {item}
          </li>
        ))}
      </ul>
      {items.length > recent.length && (
        <div className="text-[10px] text-text-dim">+ {items.length - recent.length} earlier</div>
      )}
    </div>
  );
}

function DecisionsList({
  decisions,
}: {
  decisions: { decision: string; rationale: string; alternatives: string[]; at: number }[];
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-text-dim font-medium uppercase tracking-wider">
        Decisions ({decisions.length})
      </div>
      <ul className="space-y-1.5">
        {decisions.slice(-5).map((d, i) => (
          <li key={`${d.decision}-${i}`} className="text-[11px] space-y-0.5">
            <div className="text-text font-medium">{d.decision}</div>
            {d.rationale && <div className="text-text-dim">{d.rationale}</div>}
            {d.alternatives.length > 0 && (
              <div className="text-text-dim italic">
                alternatives: {d.alternatives.join(', ')}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
