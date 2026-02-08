// Shared game state store (in-memory, single server)
// Using globalThis to persist across hot reloads in development

import { GameState } from './types';

const globalStore = globalThis as unknown as {
  __gameStore?: Map<string, GameState>;
};

if (!globalStore.__gameStore) {
  globalStore.__gameStore = new Map<string, GameState>();
}

export const games: Map<string, GameState> = globalStore.__gameStore;
