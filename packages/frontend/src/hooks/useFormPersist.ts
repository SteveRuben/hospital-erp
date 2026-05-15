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
 * Save all visible form data on the page (called before session timeout)
 */
export function saveAllFormsOnPage(): void {
  const path = window.location.pathname;
  
  // Find all form inputs on the page and save their values
  const formData: Record<string, string> = {};
  const inputs = document.querySelectorAll('input, textarea, select');
  inputs.forEach((el, idx) => {
    const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const name = input.name || input.id || `field_${idx}`;
    if (input.type === 'password') return; // Never save passwords
    if (input.value) formData[name] = input.value;
  });

  if (Object.keys(formData).length > 0) {
    try {
      sessionStorage.setItem('page_form_data', JSON.stringify({ path, data: formData, timestamp: Date.now() }));
    } catch { /* ignore */ }
  }
}

/**
 * Hook for form persistence in a specific component.
 * Auto-saves form state on change, restores on mount.
 */
export function useFormPersist<T extends Record<string, unknown>>(
  key: string,
  form: T,
  setForm: (data: T) => void,
): { clearSaved: () => void; hasSaved: boolean } {
  
  // Restore on mount
  useEffect(() => {
    const saved = getFormState<T>(key);
    if (saved) {
      setForm(saved);
    }
  }, [key]);

  // Save on every change
  useEffect(() => {
    // Only save if form has actual data (not empty)
    const hasData = Object.values(form).some(v => v !== '' && v !== null && v !== undefined);
    if (hasData) {
      saveFormState(key, form);
    }
  }, [key, form]);

  const clearSaved = useCallback(() => {
    clearFormState(key);
  }, [key]);

  const hasSaved = getFormState(key) !== null;

  return { clearSaved, hasSaved };
}

export default useFormPersist;
