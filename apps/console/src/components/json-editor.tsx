'use client';

import { useState } from 'react';
import { Textarea } from './ui/input';

/**
 * Textarea bound to a JSON value. Invalid JSON is kept in local state (so the
 * user can keep typing) and reported upward as `null` so callers can block save.
 */
export function JsonEditor({
  value,
  onChange,
  rows,
  placeholder,
}: {
  value: Record<string, unknown> | unknown[] | undefined;
  onChange: (parsed: Record<string, unknown> | unknown[] | null, raw: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(() =>
    value === undefined ? '' : JSON.stringify(value, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  const handle = (next: string) => {
    setRaw(next);
    if (!next.trim()) {
      setError(null);
      onChange({}, next);
      return;
    }
    try {
      const parsed = JSON.parse(next);
      setError(null);
      onChange(parsed, next);
    } catch (err) {
      setError((err as Error).message);
      onChange(null, next);
    }
  };

  return (
    <>
      <Textarea
        className="min-h-32 font-mono text-xs"
        rows={rows ?? 8}
        value={raw}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => handle(e.target.value)}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
