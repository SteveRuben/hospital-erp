/**
 * Realtime gateway abstraction.
 *
 * Wraps the Socket.IO server so other services (notify.ts, chat — Phase 2)
 * don't directly depend on the socket library. Today it stays inert until
 * `attachRealtime(httpServer)` is called from index.ts; emits no-op gracefully
 * while undefined.
 *
 * Each connected client joins a user-scoped room `user:<id>` after auth so
 * `emitToUser` is a single Socket.IO room emit, not a broadcast-and-filter.
 *
 * Sticky-session note: Railway routes a given client to one replica by default
 * via x-forwarded-for affinity. For multi-replica deploys, swap the in-process
 * adapter for `@socket.io/redis-adapter` so cross-replica emits work. Single
 * replica is the current default for per-hospital deploys (see ARCHITECTURE_MULTI_HOPITAL.md).
 */

import type { Server as IOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hospital_secret_key_2024';

let io: IOServer | null = null;

export function attachRealtime(httpServer: import('http').Server): void {
  // Lazy import to avoid pulling socket.io into test bundles that don't need it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  import('socket.io').then(({ Server }) => {
    io = new Server(httpServer, {
      path: '/socket.io',
      cors: {
        origin: (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(s => s.trim()),
        credentials: false,
      },
      // Match the auth middleware: only accept tokens that pass JWT verification
      // with the pinned HS256 algorithm.
    });

    io.use((socket, next) => {
      const token = (socket.handshake.auth?.token as string | undefined)
        || (socket.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, ''));
      if (!token) return next(new Error('Token requis'));
      try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;
        if (!decoded.id) return next(new Error('Token malformé'));
        (socket.data as { userId: number }).userId = decoded.id;
        next();
      } catch {
        next(new Error('Token invalide'));
      }
    });

    io.on('connection', (socket) => {
      const userId = (socket.data as { userId: number }).userId;
      socket.join(`user:${userId}`);

      // Chat channel subscription. Membership is verified against DB at
      // subscribe time so a client can't spy on a channel by guessing its id.
      socket.on('chat:subscribe', async (channelId: number) => {
        try {
          const { prisma } = await import('../config/db.js');
          const member = await prisma.channelMember.findUnique({
            where: { channelId_userId: { channelId: Number(channelId), userId } },
            select: { userId: true },
          });
          if (member) socket.join(`channel:${Number(channelId)}`);
        } catch { /* ignore — client will fall back to polling messages on focus */ }
      });

      socket.on('chat:unsubscribe', (channelId: number) => {
        socket.leave(`channel:${Number(channelId)}`);
      });
    });

    console.log('[REALTIME] Socket.IO gateway attached');
  }).catch((err) => {
    console.warn('[REALTIME] socket.io not available — notifications fall back to polling:', err.message);
  });
}

/**
 * Emit `event` with `payload` to all sockets owned by `userId`.
 * No-op if the gateway hasn't been attached yet (tests, early boot).
 */
export function emitToUser(userId: number, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/**
 * Emit to a chat channel room (Phase 2). Stays here so chat doesn't need
 * its own gateway file — one realtime entry point for the whole app.
 */
export function emitToChannel(channelId: number, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`channel:${channelId}`).emit(event, payload);
}

export default { attachRealtime, emitToUser, emitToChannel };
