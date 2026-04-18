/**
 * Inline result preview — shows a 1-3 line summary of a tool's output without
 * forcing the user to expand the card. Style: dim, mono, single line by default.
 */
import type { ToolCall } from '@/hooks/use-streaming-turn';
import { classifyTool } from '@/lib/summarize-tools';

const MAX_LINES = 3;
const MAX_CHARS_PER_LINE = 110;

function clamp(line: string): string {
  return line.length > MAX_CHARS_PER_LINE ? `${line.slice(0, MAX_CHARS_PER_LINE)}…` : line;
}

function pickLines(text: string): string[] {
  const lines = text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  return lines.slice(0, MAX_LINES).map(clamp);
}

function previewFromResult(tool: ToolCall): string[] {
  const r = tool.result;
  const cat = classifyTool(tool.name);
  if (r == null) return [];

  // Strings → first 3 lines
  if (typeof r === 'string') return pickLines(r);

  // Arrays → "N items" + first item summary
  if (Array.isArray(r)) {
    const head = r[0];
    const headStr =
      typeof head === 'string'
        ? head
        : head && typeof head === 'object'
          ? JSON.stringify(head).slice(0, MAX_CHARS_PER_LINE)
          : String(head);
    return [`${r.length} item${r.length === 1 ? '' : 's'}`, clamp(headStr)].filter(Boolean);
  }

  // Objects with known shapes
  if (typeof r === 'object') {
    const rec = r as Record<string, unknown>;

    // Shell-like { stdout, stderr, exitCode }
    if (cat === 'shell' || 'stdout' in rec || 'exitCode' in rec) {
      const lines: string[] = [];
      if (typeof rec.exitCode === 'number') lines.push(`exit ${rec.exitCode}`);
      if (typeof rec.stdout === 'string' && rec.stdout) lines.push(...pickLines(rec.stdout));
      else if (typeof rec.stderr === 'string' && rec.stderr) lines.push(...pickLines(rec.stderr));
      return lines.slice(0, MAX_LINES);
    }

    // Read result: { content, lineCount } or { lines }
    if (cat === 'read') {
      if (typeof rec.lineCount === 'number') return [`${rec.lineCount} lines`];
      if (typeof rec.lines === 'number') return [`${rec.lines} lines`];
      if (typeof rec.size === 'number') return [`${rec.size} bytes`];
      if (typeof rec.content === 'string') return pickLines(rec.content);
    }

    // Search result: { matches: [...] } or { count }
    if (cat === 'search') {
      if (Array.isArray(rec.matches)) return [`${rec.matches.length} matches`];
      if (typeof rec.count === 'number') return [`${rec.count} matches`];
    }

    // Generic: pick first string field
    for (const v of Object.values(rec)) {
      if (typeof v === 'string' && v.length > 0) return pickLines(v);
    }
  }

  return [];
}

export function ResultPreview({ tool }: { tool: ToolCall }) {
  if (tool.status !== 'success' && tool.status !== 'error') return null;
  const lines = previewFromResult(tool);
  if (lines.length === 0) return null;
  const tone = tool.status === 'error' ? 'text-red/80' : 'text-text-dim';
  return (
    <div className={`pl-7 pr-3 pb-1.5 -mt-0.5 font-mono text-[11px] ${tone} space-y-0.5`}>
      {lines.map((l, i) => (
        <div key={i} className="truncate">
          {l}
        </div>
      ))}
    </div>
  );
}
