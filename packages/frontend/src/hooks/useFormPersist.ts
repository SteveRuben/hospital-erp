/**
 * Hook to persist form state across session timeouts.
 * Saves form data to sessionStorage on every change.
 * Restores it when the component mounts (after re-login).
 * Clears it on successful submit.
 */

import { useEffect, useCallback } from 'react';

const STORAGE_PREFIX = 'form_persist_';

/**
 * Save the current form state for a given page key
 */
export function saveFormState(key: string, data: unknown): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
  } catch { /* storage full or unavailable */ }
}

/**
 * Get saved form state for a given page key
 */
export function getFormState<T>(key: string): T | null {
  try {
    const saved = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!saved) return null;
    return JSON.parse(saved) as T;
  } catch { return null; }
}

/**
 * Clear saved form state (call on successful submit)
 */
export function clearFormState(key: string): void {
  sessionStorage.removeItem(STORAGE_PREFIX + key);
}

/**
 * Hook for form persistence in a specific component.
 * Auto-saves form state on change, restores on mount.
 *
 * `enabled` (default true) gates BOTH the restore-on-mount and the
 * save-on-change effects. The caller must set it to false while an
 * async server fetch is loading the authoritative state — otherwise the
 * restored draft and the fetch race and the last writer wins silently.
 */
export function useFormPersist<T extends Record<string, unknown>>(
  key: string,
  form: T,
  setForm: (data: T) => void,
  enabled: boolean = true,
): { clearSaved: () => void; hasSaved: boolean } {

  // Restore on mount
  useEffect(() => {
    if (!enabled) return;
    const saved = getFormState<T>(key);
    if (saved) {
      setForm(saved);
    }
  }, [key, enabled]);

  // Save on every change
  useEffect(() => {
    if (!enabled) return;
    // Only save if form has actual data (not empty)
    const hasData = Object.values(form).some(v => v !== '' && v !== null && v !== undefined);
    if (hasData) {
      saveFormState(key, form);
    }
  }, [key, form, enabled]);

  const clearSaved = useCallback(() => {
    clearFormState(key);
  }, [key]);

  const hasSaved = getFormState(key) !== null;

  return { clearSaved, hasSaved };
}

export default useFormPersist;
