import { useEffect, useRef, useState, useCallback } from 'react';
import type { SSEEvent } from './api-client';

interface UseSSEOptions {
  path: string;
  onEvent: (event: SSEEvent) => void;
  maxRetries?: number;
  /** Delay connection until true (e.g. wait for auth). */
  enabled?: boolean;
}

export function useSSE({ path, onEvent, maxRetries = 10, enabled = true }: UseSSEOptions) {
  const [connected, setConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
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
      es.close();
      sourceRef.current = null;

      setRetryCount((prev) => {
        const next = prev + 1;
        if (next <= maxRetries) {
          const delay = Math.min(1000 * 2 ** Math.min(prev, 5), 30_000);
          setTimeout(connect, delay);
        }
        return next;
      });
    };
  }, [path, maxRetries]);

  const reconnect = useCallback(() => {
    setRetryCount(0);
    connect();
  }, [connect]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [connect, enabled]);

  const failed = retryCount > maxRetries;
  const reconnecting = !connected && retryCount > 0 && !failed;

  return { connected, retryCount, reconnect, failed, reconnecting };
}
