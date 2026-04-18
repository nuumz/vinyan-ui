/**
 * Helpers for extracting file-path-like strings from arbitrary tool arguments.
 *
 * Tool arg shapes vary across tools (`path`, `file`, `filePath`, `targetFile`,
 * `paths`, etc.), so we walk the structure and collect any string value keyed
 * by a path-like name. Used to render clickable FileChip components above the
 * raw JSON so users can quickly see what files a tool touched (Copilot-style).
 */
const PATH_KEYS = new Set([
  'path',
  'file',
  'filepath',
  'filePath',
  'filename',
  'fileName',
  'target',
  'targetFile',
  'target_file',
  'source',
  'destination',
  'input',
  'output',
]);

const PATH_ARRAY_KEYS = new Set(['paths', 'files', 'filePaths', 'targets']);

const MAX_PATHS = 8;

/** Heuristic: looks like a file path (contains / or \\ or ends with recognizable extension). */
function looksLikePath(s: string): boolean {
  if (typeof s !== 'string' || s.length === 0 || s.length > 512) return false;
  if (s.includes('\n')) return false;
  if (/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|md|json|yaml|yml|toml|css|scss|html|sh)$/i.test(s)) {
    return true;
  }
  return s.includes('/') || s.includes('\\');
}

export function extractFilePaths(args: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown, parentKey?: string): void => {
    if (out.length >= MAX_PATHS) return;
    if (node == null) return;
    if (typeof node === 'string') {
      if (parentKey && (PATH_KEYS.has(parentKey) || looksLikePath(node))) {
        if (!seen.has(node) && looksLikePath(node)) {
          seen.add(node);
          out.push(node);
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      const isPathArray = parentKey ? PATH_ARRAY_KEYS.has(parentKey) : false;
      for (const item of node) {
        if (isPathArray && typeof item === 'string') {
          if (!seen.has(item) && looksLikePath(item)) {
            seen.add(item);
            out.push(item);
            if (out.length >= MAX_PATHS) return;
          }
        } else {
          visit(item, parentKey);
        }
      }
      return;
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        visit(v, k);
      }
    }
  };

  visit(args);
  return out;
}

/** Render-ready short basename (last segment). */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
