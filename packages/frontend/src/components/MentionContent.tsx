import type { ReactNode } from 'react';

/**
 * Renders a content string with @mentions replaced by chips showing the
 * mentioned user's full name. The author's name in the chip is the source
 * of truth; the @handle stays accessible via the tooltip.
 *
 * Special-case: `@tous` and `@all` render as a "Tout le canal" chip in red
 * — used in group chat channels to broadcast a message.
 *
 * The `mentions` array is resolved server-side (see routes/notes.ts and
 * routes/chat.ts) so this component is purely presentational.
 */

export interface MentionUser {
  id: number;
  username: string;
  nom: string | null;
  prenom: string | null;
  role: string;
}

interface Props {
  content: string;
  mentions?: MentionUser[];
}

// Same matcher as the server-side parser: requires word boundary before @
// so `email@example.com` is not a mention.
const MENTION_RE = /(?:^|[\s.,;!?])@([a-zA-Z0-9._-]{2,100})\b/g;
const BROADCAST_HANDLES = new Set(['tous', 'all', 'everyone', 'channel']);

export default function MentionContent({ content, mentions = [] }: Props) {
  const userByHandle = new Map(mentions.map(m => [m.username.toLowerCase(), m]));
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;

  while ((m = MENTION_RE.exec(content)) !== null) {
    const handle = m[1].toLowerCase();
    const matchStart = m.index + (m[0].startsWith('@') ? 0 : 1); // skip the boundary char
    const matchEnd = m.index + m[0].length;

    // Emit the text before this match (including the boundary char)
    if (matchStart > lastIndex) parts.push(content.substring(lastIndex, matchStart));

    if (BROADCAST_HANDLES.has(handle)) {
      parts.push(
        <span key={`b-${m.index}`} className="tag tag-red" style={{ fontWeight: 600 }} title="Mention de tous les membres du canal">
          @tous
        </span>
      );
    } else {
      const user = userByHandle.get(handle);
      if (user) {
        const display = `${user.prenom ?? ''} ${user.nom ?? ''}`.trim() || user.username;
        parts.push(
          <span key={`m-${m.index}`} className="tag tag-blue" style={{ fontWeight: 500 }} title={`@${user.username} — ${user.role}`}>
            @{display}
          </span>
        );
      } else {
        // Unresolved mention (user deleted, wrong handle) — render as muted text
        parts.push(
          <span key={`u-${m.index}`} style={{ color: 'var(--cds-text-secondary)' }} title="Utilisateur introuvable">
            @{m[1]}
          </span>
        );
      }
    }
    lastIndex = matchEnd;
  }
  if (lastIndex < content.length) parts.push(content.substring(lastIndex));

  return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parts}</span>;
}
