import { CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CodingCliSessionState } from '@/hooks/coding-cli-state';
import { ProviderBadge } from './coding-cli-shared';

interface CodingCliResultProps {
  session: CodingCliSessionState;
}

/**
 * Final-result + Vinyan-verification surface. Renders only when the CLI
 * has emitted a structured `<CODING_CLI_RESULT>` envelope (parsed
 * server-side). The verification block is rendered separately so the user
 * sees both the CLI's claim AND Vinyan's verdict — the gap between the
 * two is the A7 prediction-error signal.
 */
export function CodingCliResult({ session }: CodingCliResultProps) {
  const claim = session.result;
  if (!claim) return null;
  const verification = session.verification;
  const claimedPass = claim.verification?.claimedPassed ?? false;
  const actuallyPassed = verification?.passed ?? null;
  const predictionError = !!(claimedPass && actuallyPassed === false);

  return (
    <div className="border border-border rounded-md p-3 space-y-2.5 bg-surface-deep/40">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-text">CLI result</span>
        <ProviderBadge providerId={session.providerId} size="xs" />
        <span
          className={cn(
            'text-[10px] font-mono px-1.5 py-0.5 rounded border',
            claim.status === 'completed'
              ? 'bg-green/10 text-green border-green/30'
              : claim.status === 'partial'
                ? 'bg-yellow/10 text-yellow border-yellow/30'
                : 'bg-red/10 text-red border-red/30',
          )}
        >
          {claim.status}
        </span>
        {predictionError && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-red/15 text-red border-red/40 inline-flex items-center gap-1">
            <ShieldAlert size={10} />
            prediction error
          </span>
        )}
      </div>

      {claim.summary && (
        <div className="text-xs text-text wrap-break-word">{claim.summary}</div>
      )}

      {(claim.changedFiles.length > 0 || claim.commandsRun.length > 0 || claim.testsRun.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {claim.changedFiles.length > 0 && (
            <ResultList title="Changed files" items={claim.changedFiles} />
          )}
          {claim.commandsRun.length > 0 && (
            <ResultList title="Commands run" items={claim.commandsRun} />
          )}
          {claim.testsRun.length > 0 && (
            <ResultList title="Tests run" items={claim.testsRun} />
          )}
        </div>
      )}

      {claim.decisions.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] text-text-dim font-medium uppercase tracking-wider">
            Decisions ({claim.decisions.length})
          </div>
          <ul className="space-y-1">
            {claim.decisions.slice(0, 5).map((d, i) => (
              <li key={`${d.decision}-${i}`} className="text-xs text-text">
                <span className="font-medium">{d.decision}</span>
                {d.reason && <span className="text-text-dim"> — {d.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {claim.blockers.length > 0 && (
        <div className="border border-red/30 bg-red/5 rounded p-2 space-y-1">
          <div className="text-[11px] text-red font-medium uppercase tracking-wider">Blockers</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {claim.blockers.map((b, i) => (
              <li key={i} className="text-xs text-red">{b}</li>
            ))}
          </ul>
        </div>
      )}

      <VerificationBlock
        actuallyPassed={actuallyPassed}
        claimedPass={claimedPass}
        verification={verification}
      />
    </div>
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-[11px] text-text-dim font-medium uppercase tracking-wider mb-1">
        {title} ({items.length})
      </div>
      <ul className="space-y-0.5 max-h-32 overflow-y-auto">
        {items.slice(0, 12).map((item, i) => (
          <li key={`${item}-${i}`} className="text-[11px] font-mono text-text wrap-break-word">
            {item}
          </li>
        ))}
        {items.length > 12 && (
          <li className="text-[10px] text-text-dim">+ {items.length - 12} more</li>
        )}
      </ul>
    </div>
  );
}

function VerificationBlock({
  actuallyPassed,
  claimedPass,
  verification,
}: {
  actuallyPassed: boolean | null;
  claimedPass: boolean;
  verification: CodingCliSessionState['verification'];
}) {
  if (actuallyPassed === null) {
    return (
      <div className="text-[11px] text-text-dim italic border-t border-border pt-2">
        Vinyan verification not run.
      </div>
    );
  }
  const palette = actuallyPassed
    ? 'bg-green/5 border-green/20 text-green'
    : 'bg-red/5 border-red/20 text-red';
  const Icon = actuallyPassed ? ShieldCheck : ShieldAlert;
  return (
    <div className={cn('border-t border-border pt-2 space-y-1.5')}>
      <div className={cn('flex items-start gap-2 rounded-md p-2 border', palette)}>
        <Icon size={14} className="shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xs font-medium">
            Vinyan verification: {actuallyPassed ? 'passed' : 'failed'}
          </div>
          {claimedPass !== actuallyPassed && (
            <div className="text-[11px] italic">
              CLI claimed {claimedPass ? 'pass' : 'fail'} — Vinyan disagreed (A7).
            </div>
          )}
          {verification?.reason && (
            <div className="text-[11px] text-text-dim">{verification.reason}</div>
          )}
        </div>
      </div>

      {verification && verification.oracleVerdicts.length > 0 && (
        <ul className="space-y-1 pl-1">
          {verification.oracleVerdicts.map((v, i) => (
            <li key={`${v.name}-${i}`} className="flex items-start gap-1.5 text-[11px]">
              {v.ok ? (
                <CheckCircle2 size={11} className="text-green shrink-0 mt-0.5" />
              ) : (
                <XCircle size={11} className="text-red shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-mono text-text">{v.name}</span>
                {v.detail && <span className="text-text-dim"> — {v.detail}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {verification?.testResults && (
        <div className="text-[11px] text-text-dim pl-1">
          tests:{' '}
          <span className="text-green">{verification.testResults.passed} passed</span>
          {verification.testResults.failed > 0 && (
            <>, <span className="text-red">{verification.testResults.failed} failed</span></>
          )}
          {verification.testResults.skipped > 0 && <>, {verification.testResults.skipped} skipped</>}
        </div>
      )}
    </div>
  );
}
