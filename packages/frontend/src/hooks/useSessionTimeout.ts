import { useEffect, useRef, useCallback } from 'react';

const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

export function useSessionTimeout(onTimeout: () => void, isActive: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (!isActive) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    // Hide warning if visible
    const warningEl = document.getElementById('session-warning');
    if (warningEl) warningEl.style.display = 'none';

    // Show warning 30s before timeout
    warningRef.current = setTimeout(() => {
      const el = document.getElementById('session-warning');
      if (el) el.style.display = 'flex';
    }, TIMEOUT_MS - 30000);

    // Logout after timeout
    timerRef.current = setTimeout(() => {
      onTimeout();
    }, TIMEOUT_MS);
  }, [onTimeout, isActive]);

  useEffect(() => {
    if (!isActive) return;

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => resetTimer();

    events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));
    resetTimer();

    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [resetTimer, isActive]);
}