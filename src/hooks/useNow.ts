import { useEffect, useState } from 'react';

/**
 * Current time as epoch milliseconds, refreshed periodically.
 * Keeps render functions pure (no Date.now() during render) and lets
 * "overdue" / "in the past" labels update while a screen stays open.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
