// ============================================================
// AI Agent Persistent Memory System
//
// Architecture inspired by:
// - Anthropic's file-based CLAUDE.md pattern
// - A-MEM (Zettelkasten-inspired associative memory)
// - Generative Agents (memory stream + reflection)
//
// Three-tier hierarchy:
// 1. Core Memory: Agent identity, base strategy (always loaded)
// 2. Opponent Models: Per-opponent tendencies (loaded per game)
// 3. Strategic Insights: Learned patterns from past games
// ============================================================

import fs from 'fs';
import path from 'path';

const MEMORY_DIR = path.join(process.cwd(), 'data', 'memory');

export interface AgentProfile {
  id: string;
  name: string;
  personality: string;
  baseStrategy: string;
  gamesPlayed: number;
  wins: number;
  createdAt: string;
  updatedAt: string;
}

export interface OpponentModel {
  opponentId: string;
  opponentName: string;
  gamesAgainst: number;
  winsAgainst: number;
  observedTendencies: string[];
  strategicNotes: string[];
  lastUpdated: string;
}

export interface GameRecord {
  gameId: string;
  date: string;
  players: { id: string; name: string }[];
  winner: string;
  turnCount: number;
  keyDecisions: string[];
  lessonsLearned: string[];
  opponentBehaviors: { playerId: string; behavior: string }[];
}

export interface StrategicInsight {
  id: string;
  insight: string;
  confidence: number; // 0-1
  timesValidated: number;
  timesContradicted: number;
  context: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMemory {
  profile: AgentProfile;
  opponentModels: Record<string, OpponentModel>;
  recentGames: GameRecord[];
  strategicInsights: StrategicInsight[];
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function agentDir(agentId: string): string {
  return path.join(MEMORY_DIR, agentId);
}

export function loadAgentMemory(agentId: string): AgentMemory | null {
  const dir = agentDir(agentId);
  const profilePath = path.join(dir, 'profile.json');

  if (!fs.existsSync(profilePath)) return null;

  try {
    const profile: AgentProfile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

    const opponentModels: Record<string, OpponentModel> = {};
    const oppDir = path.join(dir, 'opponents');
    if (fs.existsSync(oppDir)) {
      for (const file of fs.readdirSync(oppDir)) {
        if (file.endsWith('.json')) {
          const model: OpponentModel = JSON.parse(fs.readFileSync(path.join(oppDir, file), 'utf-8'));
          opponentModels[model.opponentId] = model;
        }
      }
    }

    let recentGames: GameRecord[] = [];
    const gamesPath = path.join(dir, 'games.json');
    if (fs.existsSync(gamesPath)) {
      const allGames: GameRecord[] = JSON.parse(fs.readFileSync(gamesPath, 'utf-8'));
      recentGames = allGames.slice(-20); // Keep last 20 games
    }

    let strategicInsights: StrategicInsight[] = [];
    const insightsPath = path.join(dir, 'insights.json');
    if (fs.existsSync(insightsPath)) {
      strategicInsights = JSON.parse(fs.readFileSync(insightsPath, 'utf-8'));
    }

    return { profile, opponentModels, recentGames, strategicInsights };
  } catch {
    return null;
  }
}

export function saveAgentProfile(agentId: string, profile: AgentProfile): void {
  const dir = agentDir(agentId);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(profile, null, 2));
}

export function saveOpponentModel(agentId: string, model: OpponentModel): void {
  const dir = path.join(agentDir(agentId), 'opponents');
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, `${model.opponentId}.json`), JSON.stringify(model, null, 2));
}

export function saveGameRecord(agentId: string, record: GameRecord): void {
  const dir = agentDir(agentId);
  ensureDir(dir);
  const gamesPath = path.join(dir, 'games.json');

  let games: GameRecord[] = [];
  if (fs.existsSync(gamesPath)) {
    games = JSON.parse(fs.readFileSync(gamesPath, 'utf-8'));
  }
  games.push(record);

  // Keep only last 100 games to prevent unbounded growth
  if (games.length > 100) {
    games = games.slice(-100);
  }

  fs.writeFileSync(gamesPath, JSON.stringify(games, null, 2));
}

export function saveStrategicInsights(agentId: string, insights: StrategicInsight[]): void {
  const dir = agentDir(agentId);
  ensureDir(dir);
  // Prune low-confidence, highly contradicted insights
  const filtered = insights.filter(i =>
    i.confidence > 0.2 || i.timesValidated > i.timesContradicted
  );
  fs.writeFileSync(path.join(dir, 'insights.json'), JSON.stringify(filtered, null, 2));
}

export function createDefaultAgent(agentId: string, name: string, personality: string): AgentMemory {
  const profile: AgentProfile = {
    id: agentId,
    name,
    personality,
    baseStrategy: getDefaultStrategy(personality),
    gamesPlayed: 0,
    wins: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveAgentProfile(agentId, profile);

  return {
    profile,
    opponentModels: {},
    recentGames: [],
    strategicInsights: [],
  };
}

function getDefaultStrategy(personality: string): string {
  switch (personality) {
    case 'aggressive':
      return `Play aggressively. Prioritize action cards that steal or disrupt opponents.
Use Deal Breaker and Sly Deal as soon as viable targets appear.
Charge rent early and often. Target the player closest to winning.
Complete 2-card sets (Dark Blue, Brown, Utility) for speed.
Bank less, play properties more. Force the pace.`;

    case 'defensive':
      return `Play defensively. Build bank before placing properties.
Hold Just Say No for critical moments (Deal Breaker defense).
Complete sets quietly - don't draw attention to near-complete sets.
Keep the final piece in hand until ready to win.
Target Brown/Utility for stealth completions.`;

    case 'balanced':
      return `Balanced play. Adapt strategy based on game state.
Early game: Bank money and play Pass Go for card advantage.
Mid game: Place properties, charge rent with doubles if possible.
Late game: Go aggressive - use Deal Breaker with Just Say No backup.
Track played cards, especially Deal Breakers and Just Say No.
Target the leader, protect against the biggest threat.`;

    default:
      return `Play smart Monopoly Deal. Prioritize card advantage early.
Build bank before placing high-value properties.
Save powerful actions for maximum impact.
Track key cards (Deal Breaker, Just Say No).
Win with 3 complete sets.`;
  }
}

// Format memory for injection into LLM prompt
export function formatMemoryForPrompt(memory: AgentMemory, currentOpponentIds: string[]): string {
  const sections: string[] = [];

  // Core identity
  sections.push(`## Your Identity
Name: ${memory.profile.name}
Personality: ${memory.profile.personality}
Games Played: ${memory.profile.gamesPlayed} | Wins: ${memory.profile.wins} | Win Rate: ${memory.profile.gamesPlayed > 0 ? Math.round((memory.profile.wins / memory.profile.gamesPlayed) * 100) : 0}%

## Base Strategy
${memory.profile.baseStrategy}`);

  // Opponent models
  const relevantModels = currentOpponentIds
    .map(id => memory.opponentModels[id])
    .filter(Boolean);

  if (relevantModels.length > 0) {
    sections.push(`## Opponent Intelligence`);
    for (const model of relevantModels) {
      sections.push(`### ${model.opponentName}
Games Against: ${model.gamesAgainst} | Your Wins: ${model.winsAgainst}
Tendencies: ${model.observedTendencies.slice(-5).join('; ')}
Notes: ${model.strategicNotes.slice(-3).join('; ')}`);
    }
  }

  // Recent game lessons
  if (memory.recentGames.length > 0) {
    const last3 = memory.recentGames.slice(-3);
    sections.push(`## Recent Game Lessons`);
    for (const game of last3) {
      const won = game.winner === memory.profile.id;
      sections.push(`- ${won ? 'WON' : 'LOST'} (${game.turnCount} turns): ${game.lessonsLearned.slice(0, 2).join('; ')}`);
    }
  }

  // Top strategic insights
  if (memory.strategicInsights.length > 0) {
    const topInsights = [...memory.strategicInsights]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
    sections.push(`## Learned Strategies (High Confidence)
${topInsights.map(i => `- [${Math.round(i.confidence * 100)}%] ${i.insight}`).join('\n')}`);
  }

  return sections.join('\n\n');
}
