// ============================================================
// Game State Store
//
// Uses Neon Postgres when DATABASE_URL is set (production/Vercel),
// falls back to in-memory Map for local dev and tests.
// ============================================================

import { GameState } from './types';
import { eq } from 'drizzle-orm';

// In-memory fallback (used in dev/tests without DATABASE_URL)
const globalStore = globalThis as unknown as {
  __gameStore?: Map<string, GameState>;
};
if (!globalStore.__gameStore) {
  globalStore.__gameStore = new Map<string, GameState>();
}
const memoryStore = globalStore.__gameStore;

function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL;
}

export async function getGame(gameId: string): Promise<GameState | null> {
  if (!hasDatabase()) {
    return memoryStore.get(gameId) ?? null;
  }

  const { getDb } = await import('../db/drizzle');
  const { games } = await import('../db/schema');
  const db = getDb();
  const result = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (result.length === 0) return null;
  return result[0].state as GameState;
}

export async function saveGame(gameId: string, state: GameState): Promise<void> {
  if (!hasDatabase()) {
    memoryStore.set(gameId, state);
    return;
  }

  const { getDb } = await import('../db/drizzle');
  const { games } = await import('../db/schema');
  const db = getDb();
  await db
    .insert(games)
    .values({ id: gameId, state: state as any, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: games.id,
      set: { state: state as any, updatedAt: new Date() },
    });
}

export async function deleteGame(gameId: string): Promise<void> {
  if (!hasDatabase()) {
    memoryStore.delete(gameId);
    return;
  }

  const { getDb } = await import('../db/drizzle');
  const { games } = await import('../db/schema');
  const db = getDb();
  await db.delete(games).where(eq(games.id, gameId));
}
