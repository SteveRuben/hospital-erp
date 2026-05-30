/**
 * Smoke test — proves the Vitest + RTL + jsdom harness is wired
 * correctly so the next contributor can add component tests without
 * re-debugging the setup. Renders a trivial form, fills it, asserts
 * the value round-trips. Failure here means the test infrastructure
 * itself is broken, not the app.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

function MiniForm() {
  const [value, setValue] = useState('');
  return (
    <form aria-label="mini">
      <label htmlFor="x">X</label>
      <input id="x" value={value} onChange={e => setValue(e.target.value)} />
      <output>{value}</output>
    </form>
  );
}

describe('test harness smoke', () => {
  it('renders, types, and reads back', async () => {
    render(<MiniForm />);
    const input = screen.getByLabelText('X') as HTMLInputElement;
    await userEvent.type(input, 'hello');
    expect(input.value).toBe('hello');
    expect(screen.getByRole('status')).toHaveTextContent('hello');
  });
});
