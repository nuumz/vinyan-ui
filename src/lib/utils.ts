import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export function formatUsd(usd: number, decimals = 4): string {
  return `$${usd.toFixed(decimals)}`;
}

export function summarizePayload(p: Record<string, unknown>): string {
  const taskId = (p.taskId as string) ?? (p.input as Record<string, unknown>)?.id;
  const oracle = p.oracleName as string;
  const parts: string[] = [];
  if (taskId) parts.push(String(taskId));
  if (oracle) parts.push(`oracle=${oracle}`);
  return parts.length > 0 ? parts.join(' ') : JSON.stringify(p).slice(0, 80);
}
