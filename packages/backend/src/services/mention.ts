/**
 * Centralised @-mention parsing and resolution.
 *
 * The mention alphabet matches the typeahead component (a-zA-Z0-9._-, 2-100
 * chars) and the parser requires a word boundary before `@` so email
 * addresses don't get parsed as mentions.
 *
 * Resolution searches both `username` and `mention_handle` — when a user
 * has set a custom handle, they can be addressed by either. Broadcast
 * handles (@tous, @all, @everyone, @channel) are not resolved to users;
 * they trigger channel-wide fan-out in the chat route.
 */

import { prisma } from '../config/db.js';

const MENTION_RE = /(?:^|[\s.,;!?])@([a-zA-Z0-9._-]{2,100})\b/g;
export const BROADCAST_HANDLES = new Set(['tous', 'all', 'everyone', 'channel']);

/**
 * Extract unique @-handles from a content string (lowercased). Includes
 * broadcast handles — callers split real-vs-broadcast as needed.
 */
export function extractMentions(content: string): string[] {
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(content)) !== null) matches.add(m[1].toLowerCase());
  return Array.from(matches);
}

export interface ResolvedMention {
  id: number;
  username: string;
  mention_handle: string | null;
  nom: string | null;
  prenom: string | null;
  role: string;
}

/**
 * Resolve a list of handles to user records. Matches by `username` or
 * `mention_handle` (case-insensitive). Filters out broadcast handles —
 * those are not user-bound.
 */
export async function resolveMentions(handles: string[]): Promise<ResolvedMention[]> {
  const real = handles.filter(h => !BROADCAST_HANDLES.has(h));
  if (real.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { in: real, mode: 'insensitive' } },
        { mentionHandle: { in: real, mode: 'insensitive' } },
      ],
    },
    select: { id: true, username: true, mentionHandle: true, nom: true, prenom: true, role: true },
  });
  return users.map(u => ({ ...u, mention_handle: u.mentionHandle }));
}

export default { extractMentions, resolveMentions, BROADCAST_HANDLES };
