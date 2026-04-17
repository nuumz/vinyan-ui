import { useEffect, useRef, useState, useCallback } from 'react';
import type { SSEEvent } from './api-client';

interface UseSSEOptions {
  path: string;
  onEvent: (event: SSEEvent) => void;
  /** Delay connection until true (e.g. wait for auth). */
  enabled?: boolean;
}

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
 * - Periodic watchdog (every 30s) catches zombie connections
 */
export function useSSE({ path, onEvent, enabled = true }: UseSSEOptions) {
  const [connected, setConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    };

    es.onmessage = (e) => {
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

    // Watchdog: every 30s, check if EventSource silently died
    watchdogRef.current = setInterval(() => {
      const es = sourceRef.current;
      if (!es || es.readyState === EventSource.CLOSED) {
        // Connection is dead and no retry timer is pending
        if (!retryTimerRef.current) {
          connect();
        }
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
