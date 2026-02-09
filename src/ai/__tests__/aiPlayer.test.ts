import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Player, PropertySet, PropertyCard, WildcardCard, Card, GameState } from '@/game/types';
import { autoSelectPayment, isSetComplete, countCompleteSets } from '@/game/engine';
import {
  loadAgentMemory,
  createDefaultAgent,
  saveAgentProfile,
  saveOpponentModel,
  saveStrategicInsights,
  formatMemoryForPrompt,
  AgentMemory,
  AgentProfile,
  OpponentModel,
  StrategicInsight,
} from '@/ai/memory/memoryManager';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ============================================================
// Helpers
// ============================================================

function makeProperty(id: string, color: string, name: string, value: number): PropertyCard {
  return { id, type: 'property', color: color as any, name, value };
}

function makeMoney(id: string, value: number): Card {
  return { id, type: 'money', value };
}

function makeWildcard(id: string, colors: string[] | 'all', value: number): WildcardCard {
  return { id, type: 'wildcard', colors: colors as any, value };
}

// ============================================================
// AI Heuristic: autoSelectPayment (used by AI fallback)
// ============================================================

describe('AI payment heuristics', () => {
  it('prefers smaller bills from bank', () => {
    const player: Player = {
      id: 'ai', name: 'AI', hand: [], isAI: true,
      bank: [
        makeMoney('m10', 10),
        makeMoney('m1a', 1),
        makeMoney('m1b', 1),
        makeMoney('m2', 2),
      ],
      properties: [],
    };

    const selected = autoSelectPayment(player, 3);
    // Should pick $1 + $1 + $2 = $4 (overpay with small bills) rather than $10
    expect(selected).toContain('m1a');
    expect(selected).toContain('m1b');
    // May or may not include m2 depending on whether 2 already covers it
    // $1+$1 = $2 < $3, so m2 should be included
    expect(selected).toContain('m2');
    expect(selected).not.toContain('m10');
  });

  it('uses properties from incomplete sets before complete ones', () => {
    const player: Player = {
      id: 'ai', name: 'AI', hand: [], bank: [], isAI: true,
      properties: [
        {
          color: 'brown', house: false, hotel: false,
          cards: [
            makeProperty('b1', 'brown', 'Med', 1),
            makeProperty('b2', 'brown', 'Baltic', 1),
          ],
        },
        {
          color: 'red', house: false, hotel: false,
          cards: [makeProperty('r1', 'red', 'Kentucky', 3)],
        },
      ],
    };

    const selected = autoSelectPayment(player, 3);
    // Should prefer the incomplete red set property over complete brown
    expect(selected).toContain('r1');
    expect(selected).not.toContain('b1');
    expect(selected).not.toContain('b2');
  });

  it('handles zero-value rainbow wildcards correctly', () => {
    const player: Player = {
      id: 'ai', name: 'AI', hand: [], bank: [], isAI: true,
      properties: [{
        color: 'red', house: false, hotel: false,
        cards: [
          makeWildcard('rainbow', 'all', 0),
          makeProperty('r1', 'red', 'Kentucky', 3),
        ],
      }],
    };

    const selected = autoSelectPayment(player, 3);
    // Rainbow wildcard has $0 value and can't be used for payment
    expect(selected).toContain('r1');
    expect(selected).not.toContain('rainbow');
  });
});

// ============================================================
// Memory Manager
// ============================================================

describe('memory manager', () => {
  const testDir = path.join(os.tmpdir(), `dealsmart_test_${Date.now()}`);

  // Override MEMORY_DIR for tests by manipulating the module
  // Since memoryManager uses process.cwd(), we'll test the formatting functions
  // which don't require filesystem access

  describe('formatMemoryForPrompt', () => {
    it('formats agent profile with win rate', () => {
      const memory: AgentMemory = {
        profile: {
          id: 'test', name: 'TestBot', personality: 'aggressive',
          baseStrategy: 'Attack early',
          gamesPlayed: 10, wins: 7,
          createdAt: '2025-01-01', updatedAt: '2025-01-01',
        },
        opponentModels: {},
        recentGames: [],
        strategicInsights: [],
      };

      const prompt = formatMemoryForPrompt(memory, []);
      expect(prompt).toContain('TestBot');
      expect(prompt).toContain('aggressive');
      expect(prompt).toContain('70%'); // win rate
      expect(prompt).toContain('Attack early');
    });

    it('includes opponent models for current opponents', () => {
      const memory: AgentMemory = {
        profile: {
          id: 'test', name: 'Bot', personality: 'balanced',
          baseStrategy: 'Play smart',
          gamesPlayed: 5, wins: 2,
          createdAt: '2025-01-01', updatedAt: '2025-01-01',
        },
        opponentModels: {
          'player_0': {
            opponentId: 'player_0', opponentName: 'Alice',
            gamesAgainst: 3, winsAgainst: 1,
            observedTendencies: ['Plays aggressively', 'Hoards Just Say No'],
            strategicNotes: ['Target her bank early'],
            lastUpdated: '2025-01-01',
          },
          'player_99': {
            opponentId: 'player_99', opponentName: 'Unknown',
            gamesAgainst: 1, winsAgainst: 0,
            observedTendencies: ['Unknown'],
            strategicNotes: [],
            lastUpdated: '2025-01-01',
          },
        },
        recentGames: [],
        strategicInsights: [],
      };

      const prompt = formatMemoryForPrompt(memory, ['player_0']);
      expect(prompt).toContain('Alice');
      expect(prompt).toContain('Plays aggressively');
      expect(prompt).toContain('Hoards Just Say No');
      // Should NOT include player_99 (not in current game)
      expect(prompt).not.toContain('Unknown');
    });

    it('includes recent game lessons', () => {
      const memory: AgentMemory = {
        profile: {
          id: 'test', name: 'Bot', personality: 'balanced',
          baseStrategy: 'Play smart',
          gamesPlayed: 1, wins: 1,
          createdAt: '2025-01-01', updatedAt: '2025-01-01',
        },
        opponentModels: {},
        recentGames: [{
          gameId: 'g1', date: '2025-01-01',
          players: [{ id: 'test', name: 'Bot' }],
          winner: 'test', turnCount: 15,
          keyDecisions: ['Saved Deal Breaker for turn 12'],
          lessonsLearned: ['Banking first 3 turns was effective'],
          opponentBehaviors: [],
        }],
        strategicInsights: [],
      };

      const prompt = formatMemoryForPrompt(memory, []);
      expect(prompt).toContain('WON');
      expect(prompt).toContain('Banking first 3 turns was effective');
    });

    it('includes top strategic insights sorted by confidence', () => {
      const memory: AgentMemory = {
        profile: {
          id: 'test', name: 'Bot', personality: 'balanced',
          baseStrategy: 'Play smart',
          gamesPlayed: 10, wins: 5,
          createdAt: '2025-01-01', updatedAt: '2025-01-01',
        },
        opponentModels: {},
        recentGames: [],
        strategicInsights: [
          {
            id: 'i1', insight: 'Low priority insight', confidence: 0.3,
            timesValidated: 1, timesContradicted: 0, context: 'test',
            createdAt: '2025-01-01', updatedAt: '2025-01-01',
          },
          {
            id: 'i2', insight: 'High priority insight', confidence: 0.9,
            timesValidated: 5, timesContradicted: 0, context: 'test',
            createdAt: '2025-01-01', updatedAt: '2025-01-01',
          },
        ],
      };

      const prompt = formatMemoryForPrompt(memory, []);
      expect(prompt).toContain('High priority insight');
      expect(prompt).toContain('90%');
      // High confidence should appear before low confidence
      const highIdx = prompt.indexOf('High priority insight');
      const lowIdx = prompt.indexOf('Low priority insight');
      expect(highIdx).toBeLessThan(lowIdx);
    });

    it('handles empty memory gracefully', () => {
      const memory: AgentMemory = {
        profile: {
          id: 'new', name: 'NewBot', personality: 'defensive',
          baseStrategy: 'Play safe',
          gamesPlayed: 0, wins: 0,
          createdAt: '2025-01-01', updatedAt: '2025-01-01',
        },
        opponentModels: {},
        recentGames: [],
        strategicInsights: [],
      };

      const prompt = formatMemoryForPrompt(memory, ['player_0']);
      expect(prompt).toContain('NewBot');
      expect(prompt).toContain('0%'); // 0 win rate
      expect(prompt).not.toContain('Opponent Intelligence');
      expect(prompt).not.toContain('Recent Game Lessons');
    });
  });

  describe('createDefaultAgent', () => {
    it('creates aggressive agent with attack-oriented strategy', async () => {
      const memory = await createDefaultAgent('test_agg', 'Aggro', 'aggressive');
      expect(memory.profile.personality).toBe('aggressive');
      expect(memory.profile.baseStrategy).toContain('aggressively');
      expect(memory.profile.gamesPlayed).toBe(0);
    });

    it('creates defensive agent with bank-first strategy', async () => {
      const memory = await createDefaultAgent('test_def', 'Defender', 'defensive');
      expect(memory.profile.personality).toBe('defensive');
      expect(memory.profile.baseStrategy).toContain('defensively');
    });

    it('creates balanced agent with adaptive strategy', async () => {
      const memory = await createDefaultAgent('test_bal', 'Balanced', 'balanced');
      expect(memory.profile.personality).toBe('balanced');
      expect(memory.profile.baseStrategy).toContain('Balanced');
    });

    it('starts with empty opponent models and insights', async () => {
      const memory = await createDefaultAgent('test_empty', 'Bot', 'balanced');
      expect(Object.keys(memory.opponentModels)).toHaveLength(0);
      expect(memory.recentGames).toHaveLength(0);
      expect(memory.strategicInsights).toHaveLength(0);
    });
  });
});
