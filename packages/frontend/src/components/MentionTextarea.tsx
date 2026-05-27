import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { lookupUsers, type UserLookup } from '../services/api';

/**
 * Textarea with @-mention typeahead.
 *
 * Watches the caret position. When the user types `@` followed by 1+ chars
 * matching the mention alphabet ([a-zA-Z0-9._-]), it queries
 * /api/auth/users/lookup and shows a floating popup of matches anchored to
 * the bottom of the textarea (simpler than computing the caret's pixel
 * position, and good enough for short notes / chat lines).
 *
 * Keyboard:
 *   - ↑ / ↓     navigate suggestions
 *   - Enter / Tab    insert highlighted suggestion
 *   - Esc       close popup
 * Mouse:
 *   - Click suggestion to insert
 *
 * Inserting replaces the `@partial` token with `@username ` (trailing space).
 */

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  required?: boolean;
  // Forwarded to the underlying textarea so the form can submit via Enter
  // when the popup isn't open. The popup intercepts Enter/Tab when active.
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

const MENTION_TRIGGER = /(?:^|[\s])@([a-zA-Z0-9._-]*)$/;

export default function MentionTextarea({ value, onChange, placeholder, rows = 3, className = 'form-textarea', required, onKeyDown }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<UserLookup[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);

  // Run the lookup whenever a mention token is active. Debounced lightly by
  // bailing out on the same query.
  const lastQueryRef = useRef<string>('');
  useEffect(() => {
    if (!mentionRange) { setSuggestions([]); return; }
    const query = value.substring(mentionRange.start + 1, mentionRange.end);
    if (query.length < 1) { setSuggestions([]); return; }
    if (query === lastQueryRef.current) return;
    lastQueryRef.current = query;
    let cancelled = false;
    lookupUsers(query).then(({ data }) => {
      if (!cancelled) { setSuggestions(data); setSelectedIndex(0); }
    }).catch(() => { if (!cancelled) setSuggestions([]); });
    return () => { cancelled = true; };
  }, [mentionRange, value]);

  const detectMention = useCallback((newValue: string, caret: number) => {
    const before = newValue.substring(0, caret);
    const match = MENTION_TRIGGER.exec(before);
    if (match) {
      const start = before.length - match[0].length + (match[0].startsWith('@') ? 0 : 1);
      setMentionRange({ start, end: caret });
    } else {
      setMentionRange(null);
    }
  }, []);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    detectMention(v, e.target.selectionStart);
  };

  const insertMention = (user: UserLookup) => {
    if (!mentionRange) return;
    const before = value.substring(0, mentionRange.start);
    const after = value.substring(mentionRange.end);
    const insert = `@${user.username} `;
    const newValue = before + insert + after;
    onChange(newValue);
    setMentionRange(null);
    setSuggestions([]);
    // Restore caret position after the inserted mention
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const newCaret = before.length + insert.length;
        ta.focus();
        ta.setSelectionRange(newCaret, newCaret);
      }
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionRange && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(suggestions[selectedIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionRange(null); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        className={className}
        rows={rows}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => { setTimeout(() => setMentionRange(null), 150); /* allow click on suggestion */ }}
      />
      {mentionRange && suggestions.length > 0 && (
        <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: 2, background: 'var(--cds-ui-02)', border: '1px solid var(--cds-ui-03)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, minWidth: '240px', maxHeight: '200px', overflowY: 'auto' }}>
          {suggestions.map((u, idx) => (
            <div
              key={u.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', background: idx === selectedIndex ? 'var(--cds-ui-01)' : 'transparent', borderBottom: idx < suggestions.length - 1 ? '1px solid var(--cds-ui-03)' : 'none' }}
            >
              <strong>{u.prenom} {u.nom}</strong> <span className="text-muted">@{u.username} · {u.role}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
