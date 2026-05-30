/**
 * Vitest setup — runs before every test file.
 *
 * Wires @testing-library/jest-dom's matchers (toBeInTheDocument,
 * toHaveValue, …) onto Vitest's expect, and clears the DOM between
 * tests so leaked mounts can't cross-pollute.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
