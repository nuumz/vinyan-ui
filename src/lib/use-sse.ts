import { useEffect, useRef, useState, useCallback } from 'react';
import type { SSEEvent } from './api-client';

interface UseSSEOptions {
  path: string;
  onEvent: (event: SSEEvent) => void;
  /** Delay connection until true (e.g. wait for auth). */
  enabled?: boolean;
}

/**
 * Stale-reconnect threshold — if `connected===true` but no `onmessage`
 * fires for this long, we assume the underlying TCP is dead even though
 * `readyState` still claims OPEN. Backend sends `:heartbeat` comments
 * every 30s, but EventSource silently consumes comments — so the browser
 * has zero API-level signal that bytes are flowing. We reconnect to be
 * safe. Set to 3× the backend heartbeat (30s) plus margin.
 */
const STALE_RECONNECT_MS = 100_000;

/**
 * SSE hook with manual reconnection that never gives up.
 *
 * Native EventSource auto-reconnect silently stops when the server is
 * down long enough (readyState becomes CLOSED). This hook detects that
 * and falls back to manual exponential backoff (1s → 30s cap).
 *
 * External reconnect triggers:
 * - `reconnectNow()` for health-recovery or manual retry
 * - Automatic on `visibilitychange` (tab focus) if connection is dead
 * - Periodic watchdog (every 30s) catches zombie connections — both
 *   `readyState === CLOSED` AND silently-stale (`connected===true` but
 *   no message in `STALE_RECONNECT_MS`).
 */
export function useSSE({ path, onEvent, enabled = true }: UseSSEOptions) {
  const [connected, setConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEventAtRef = useRef<number>(0);
  const onEventRef = useRef(onEvent);
  const enabledRef = useRef(enabled);
  onEventRef.current = onEvent;
  enabledRef.current = enabled;

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    clearRetryTimer();

    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }

    const es = new EventSource(path);
    sourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setRetryCount(0);
      lastEventAtRef.current = Date.now();
    };

    es.onmessage = (e) => {
      lastEventAtRef.current = Date.now();
      try {
        const event = JSON.parse(e.data) as SSEEvent;
        onEventRef.current(event);
      } catch {
        // ignore malformed
      }
    };

    es.onerror = () => {
      setConnected(false);

      // Check if EventSource has permanently given up (readyState === CLOSED)
      // If CONNECTING (0), the browser is still retrying natively — let it.
      // If CLOSED (2), native retry is dead — we must reconnect manually.
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        sourceRef.current = null;

        setRetryCount((prev) => {
          const next = prev + 1;
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
          const delay = Math.min(1000 * 2 ** Math.min(prev, 4), 30_000);
          retryTimerRef.current = setTimeout(() => {
            if (enabledRef.current) connect();
          }, delay);
          return next;
        });
      }
      // readyState === CONNECTING: browser is retrying, do nothing
    };
  }, [path, clearRetryTimer]);

  /** Force-reconnect immediately — resets retry counter. */
  const reconnectNow = useCallback(() => {
    setRetryCount(0);
    connect();
  }, [connect]);

  // Main lifecycle
  useEffect(() => {
    if (!enabled) return;
    connect();

    // Watchdog: every 30s, check for two failure modes —
    //   (1) `readyState === CLOSED`: EventSource gave up retrying.
    //   (2) Silently-stale: readyState claims OPEN but no message in
    //       STALE_RECONNECT_MS. Backend heartbeats are comments which
    //       EventSource hides from us, so we infer liveness from the
    //       last real onmessage timestamp.
    watchdogRef.current = setInterval(() => {
      const es = sourceRef.current;
      const closed = !es || es.readyState === EventSource.CLOSED;
      const stale =
        !!es &&
        es.readyState === EventSource.OPEN &&
        lastEventAtRef.current > 0 &&
        Date.now() - lastEventAtRef.current > STALE_RECONNECT_MS;
      if ((closed || stale) && !retryTimerRef.current) {
        connect();
      }
    }, 30_000);

    return () => {
      clearRetryTimer();
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      sourceRef.current?.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [connect, enabled, clearRetryTimer]);

  // Reconnect when tab becomes visible again (if dead)
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const es = sourceRef.current;
      if (!es || es.readyState === EventSource.CLOSED) {
        reconnectNow();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, reconnectNow]);

  const reconnecting = !connected && retryCount > 0;

  return { connected, retryCount, reconnectNow, reconnecting };
}
