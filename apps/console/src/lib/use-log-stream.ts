'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LogEntry } from './types';

const STREAM_PATH = '/api/connect/logs/stream';

const FLUSH_MS = 250;

const REPLAY_WINDOW_MS = 2000;

export type ConnectionState = 'connecting' | 'live' | 'offline';

function keyOf(entry: LogEntry): string {
  return `${entry.timestamp}|${entry.level}|${entry.context}|${entry.message}`;
}

export function useLogStream({
  paused,
  limit,
}: {
  paused: boolean;
  limit: number;
}) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<ConnectionState>('connecting');

  const pending = useRef<LogEntry[]>([]);
  const seen = useRef(new Set<string>());
  const replayUntil = useRef(0);
  // Read inside the EventSource handler, which is created once per mount.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const clear = useCallback(() => {
    pending.current = [];
    seen.current.clear();
    setEntries([]);
  }, []);

  useEffect(() => {
    const source = new EventSource(STREAM_PATH);

    source.onopen = () => {
      setStatus('live');
      replayUntil.current = Date.now() + REPLAY_WINDOW_MS;
    };

    // EventSource reconnects on its own; this only reports the gap.
    source.onerror = () => setStatus('offline');

    source.onmessage = (event) => {
      // Heartbeats carry no payload.
      if (!event.data) return;

      let entry: LogEntry;
      try {
        entry = JSON.parse(event.data);
      } catch {
        return;
      }

      if (Date.now() < replayUntil.current) {
        const key = keyOf(entry);
        if (seen.current.has(key)) return;
        seen.current.add(key);
      }

      pending.current.push(entry);
      // A long pause must not grow the backlog without bound.
      if (pending.current.length > limit) {
        pending.current = pending.current.slice(-limit);
      }
    };

    const timer = setInterval(() => {
      if (pausedRef.current || pending.current.length === 0) return;
      const incoming = pending.current;
      pending.current = [];
      setEntries((prev) => [...prev, ...incoming].slice(-limit));
    }, FLUSH_MS);

    return () => {
      clearInterval(timer);
      source.close();
    };
  }, [limit]);

  useEffect(() => {
    // Keys only guard the replay window, so the set can be dropped once past it.
    const timer = setInterval(() => {
      if (Date.now() > replayUntil.current) seen.current.clear();
    }, REPLAY_WINDOW_MS);
    return () => clearInterval(timer);
  }, []);

  return { entries, status, clear };
}
