import { useEffect, useRef, useState } from 'react';
import { useHealth } from './use-health';
import { useConnectionStore } from '@/store/connection-store';
import { toast } from '@/store/toast-store';

export type SystemStatus = 'online' | 'degraded' | 'dead' | 'offline';

interface SystemStatusResult {
  status: SystemStatus;
  /** Milliseconds since backend first became unreachable (null if online). */
  downSinceMs: number | null;
  /** True while the browser reports no network (navigator.onLine === false). */
  offline: boolean;
  /** Milliseconds until automatic reload fires (null if not scheduled). */
  autoReloadInMs: number | null;
  /** Force an immediate page reload. */
  reloadNow: () => void;
}

// Thresholds
const DEGRADED_AFTER_MS = 15_000; // 15s of failures → "degraded"
const DEAD_AFTER_MS = 60_000; // 60s of failures → "dead"
const AUTO_RELOAD_AFTER_MS = 5 * 60_000; // 5 minutes dead → auto-reload SPA

/**
 * Tracks the overall connectivity of the Vinyan backend and decides when the
 * app should self-heal.
 *
 * States:
 *   - online   : health is fresh OR SSE is connected, and browser reports online
 *   - offline  : navigator.onLine === false (wifi off, tunnel down)
 *   - degraded : backend unreachable for >15s but <60s — transient blip
 *   - dead     : backend unreachable for ≥60s — show a banner, offer reload
 *
 * Self-healing:
 *   - Individual fetches already retry via fetchJSON (exp backoff, jitter).
 *   - SSE reconnects forever via useSSE's manual backoff + watchdog.
 *   - Health polls every 5s while SSE is down (useFallbackInterval).
 *   - After 5 minutes in the "dead" state, the SPA auto-reloads itself so a
 *     restarted backend with new bundle hashes doesn't leave the tab stuck on
 *     stale JS. User can also click "Reload now" anytime in the banner.
 *
 * Recovery:
 *   - When a previously-dead system comes back, a success toast fires once so
 *     operators know without watching the header LED.
 */
export function useSystemStatus(): SystemStatusResult {
  const health = useHealth();
  const sseConnected = useConnectionStore((s) => s.sseConnected);
  const [offline, setOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [now, setNow] = useState(() => Date.now());
  const downSinceRef = useRef<number | null>(null);
  const wasDeadRef = useRef(false);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Browser online/offline detection
  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Tick the clock while we're not healthy so time-based thresholds advance.
  const reachable = sseConnected || (health.isSuccess && !health.isError);
  useEffect(() => {
    if (reachable && !offline) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [reachable, offline]);

  // Track when backend first went down
  if (reachable) {
    downSinceRef.current = null;
  } else if (downSinceRef.current === null) {
    downSinceRef.current = Date.now();
  }

  const downSinceMs = downSinceRef.current !== null ? now - downSinceRef.current : null;

  let status: SystemStatus;
  if (offline) status = 'offline';
  else if (reachable) status = 'online';
  else if (downSinceMs !== null && downSinceMs >= DEAD_AFTER_MS) status = 'dead';
  else if (downSinceMs !== null && downSinceMs >= DEGRADED_AFTER_MS) status = 'degraded';
  else status = 'online';

  // Auto-reload scheduling: when we enter "dead", start a 5-minute timer.
  // Cancel if we recover before it fires.
  useEffect(() => {
    if (status === 'dead' && !reloadTimerRef.current) {
      reloadTimerRef.current = setTimeout(() => {
        window.location.reload();
      }, AUTO_RELOAD_AFTER_MS - (downSinceMs ?? DEAD_AFTER_MS));
    }
    if (status !== 'dead' && reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
    return () => {
      // don't clear on unmount re-runs; lifecycle is handled above
    };
  }, [status, downSinceMs]);

  // Recovery toast: show once when we come back from "dead"
  useEffect(() => {
    if (status === 'dead') {
      wasDeadRef.current = true;
    } else if (status === 'online' && wasDeadRef.current) {
      wasDeadRef.current = false;
      toast.success('Reconnected to Vinyan');
    }
  }, [status]);

  const autoReloadInMs =
    status === 'dead' && downSinceMs !== null
      ? Math.max(0, AUTO_RELOAD_AFTER_MS - downSinceMs)
      : null;

  return {
    status,
    downSinceMs,
    offline,
    autoReloadInMs,
    reloadNow: () => window.location.reload(),
  };
}
