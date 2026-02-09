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
//
// Storage: Neon Postgres when DATABASE_URL is set,
// falls back to filesystem for local dev/tests.
// ============================================================

import fs from 'fs';
import path from 'path';
import { eq, and, desc } from 'drizzle-orm';

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

// ============================================================
// Storage Backend Detection
// ============================================================

function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL;
}

// ============================================================
// Filesystem Helpers (fallback for local dev/tests)
// ============================================================

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function agentDir(agentId: string): string {
  return path.join(MEMORY_DIR, agentId);
}

function fsLoadAgentMemory(agentId: string): AgentMemory | null {
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
      recentGames = allGames.slice(-20);
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

function fsSaveAgentProfile(agentId: string, profile: AgentProfile): void {
  const dir = agentDir(agentId);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(profile, null, 2));
}

function fsSaveOpponentModel(agentId: string, model: OpponentModel): void {
  const dir = path.join(agentDir(agentId), 'opponents');
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, `${model.opponentId}.json`), JSON.stringify(model, null, 2));
}

function fsSaveGameRecord(agentId: string, record: GameRecord): void {
  const dir = agentDir(agentId);
  ensureDir(dir);
  const gamesPath = path.join(dir, 'games.json');

  let games: GameRecord[] = [];
  if (fs.existsSync(gamesPath)) {
    games = JSON.parse(fs.readFileSync(gamesPath, 'utf-8'));
  }
  games.push(record);
  if (games.length > 100) {
    games = games.slice(-100);
  }
  fs.writeFileSync(gamesPath, JSON.stringify(games, null, 2));
}

function fsSaveStrategicInsights(agentId: string, insights: StrategicInsight[]): void {
  const dir = agentDir(agentId);
  ensureDir(dir);
  const filtered = insights.filter(i =>
    i.confidence > 0.2 || i.timesValidated > i.timesContradicted
  );
  fs.writeFileSync(path.join(dir, 'insights.json'), JSON.stringify(filtered, null, 2));
}

// ============================================================
// Database Helpers (Neon Postgres)
// ============================================================

async function dbLoadAgentMemory(agentId: string): Promise<AgentMemory | null> {
  const { getDb } = await import('../../db/drizzle');
  const schema = await import('../../db/schema');
  const db = getDb();

  const profiles = await db.select().from(schema.agentProfiles).where(eq(schema.agentProfiles.id, agentId)).limit(1);
  if (profiles.length === 0) return null;

  const row = profiles[0];
  const profile: AgentProfile = {
    id: row.id,
    name: row.name,
    personality: row.personality,
    baseStrategy: row.baseStrategy,
    gamesPlayed: row.gamesPlayed,
    wins: row.wins,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  // Load opponent models
  const oppRows = await db.select().from(schema.opponentModels).where(eq(schema.opponentModels.agentId, agentId));
  const opponentModels: Record<string, OpponentModel> = {};
  for (const opp of oppRows) {
    opponentModels[opp.opponentId] = {
      opponentId: opp.opponentId,
      opponentName: opp.opponentName,
      gamesAgainst: opp.gamesAgainst,
      winsAgainst: opp.winsAgainst,
      observedTendencies: opp.observedTendencies ?? [],
      strategicNotes: opp.strategicNotes ?? [],
      lastUpdated: opp.lastUpdated.toISOString(),
    };
  }

  // Load recent games (last 20)
  const gameRows = await db.select().from(schema.gameRecords)
    .where(eq(schema.gameRecords.agentId, agentId))
    .orderBy(desc(schema.gameRecords.date))
    .limit(20);
  const recentGames: GameRecord[] = gameRows.reverse().map(g => ({
    gameId: g.gameId,
    date: g.date.toISOString(),
    players: g.players ?? [],
    winner: g.winner,
    turnCount: g.turnCount,
    keyDecisions: g.keyDecisions ?? [],
    lessonsLearned: g.lessonsLearned ?? [],
    opponentBehaviors: g.opponentBehaviors ?? [],
  }));

  // Load strategic insights
  const insightRows = await db.select().from(schema.strategicInsights)
    .where(eq(schema.strategicInsights.agentId, agentId));
  const strategicInsights: StrategicInsight[] = insightRows.map(i => ({
    id: i.id,
    insight: i.insight,
    confidence: i.confidence,
    timesValidated: i.timesValidated,
    timesContradicted: i.timesContradicted,
    context: i.context,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));

  return { profile, opponentModels, recentGames, strategicInsights };
}

async function dbSaveAgentProfile(agentId: string, profile: AgentProfile): Promise<void> {
  const { getDb } = await import('../../db/drizzle');
  const schema = await import('../../db/schema');
  const db = getDb();

  await db
    .insert(schema.agentProfiles)
    .values({
      id: agentId,
      name: profile.name,
      personality: profile.personality,
      baseStrategy: profile.baseStrategy,
      gamesPlayed: profile.gamesPlayed,
      wins: profile.wins,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.agentProfiles.id,
      set: {
        name: profile.name,
        baseStrategy: profile.baseStrategy,
        gamesPlayed: profile.gamesPlayed,
        wins: profile.wins,
        updatedAt: new Date(),
      },
    });
}

async function dbSaveOpponentModel(agentId: string, model: OpponentModel): Promise<void> {
  const { getDb } = await import('../../db/drizzle');
  const schema = await import('../../db/schema');
  const db = getDb();

  // Check if exists
  const existing = await db.select().from(schema.opponentModels)
    .where(and(
      eq(schema.opponentModels.agentId, agentId),
      eq(schema.opponentModels.opponentId, model.opponentId),
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(schema.opponentModels)
      .set({
        opponentName: model.opponentName,
        gamesAgainst: model.gamesAgainst,
        winsAgainst: model.winsAgainst,
        observedTendencies: model.observedTendencies,
        strategicNotes: model.strategicNotes,
        lastUpdated: new Date(),
      })
      .where(and(
        eq(schema.opponentModels.agentId, agentId),
        eq(schema.opponentModels.opponentId, model.opponentId),
      ));
  } else {
    await db.insert(schema.opponentModels).values({
      agentId,
      opponentId: model.opponentId,
      opponentName: model.opponentName,
      gamesAgainst: model.gamesAgainst,
      winsAgainst: model.winsAgainst,
      observedTendencies: model.observedTendencies,
      strategicNotes: model.strategicNotes,
    });
  }
}

async function dbSaveGameRecord(agentId: string, record: GameRecord): Promise<void> {
  const { getDb } = await import('../../db/drizzle');
  const schema = await import('../../db/schema');
  const db = getDb();

  await db.insert(schema.gameRecords).values({
    agentId,
    gameId: record.gameId,
    date: new Date(record.date),
    players: record.players,
    winner: record.winner,
    turnCount: record.turnCount,
    keyDecisions: record.keyDecisions,
    lessonsLearned: record.lessonsLearned,
    opponentBehaviors: record.opponentBehaviors,
  });
}

async function dbSaveStrategicInsights(agentId: string, insights: StrategicInsight[]): Promise<void> {
  const { getDb } = await import('../../db/drizzle');
  const schema = await import('../../db/schema');
  const db = getDb();

  const filtered = insights.filter(i =>
    i.confidence > 0.2 || i.timesValidated > i.timesContradicted
  );

  // Delete existing insights for this agent
  await db.delete(schema.strategicInsights).where(eq(schema.strategicInsights.agentId, agentId));

  // Insert updated insights
  if (filtered.length > 0) {
    await db.insert(schema.strategicInsights).values(
      filtered.map(i => ({
        id: i.id,
        agentId,
        insight: i.insight,
        confidence: i.confidence,
        timesValidated: i.timesValidated,
        timesContradicted: i.timesContradicted,
        context: i.context,
        createdAt: new Date(i.createdAt),
        updatedAt: new Date(i.updatedAt),
      }))
    );
  }
}

// ============================================================
// Public API (delegates to DB or filesystem)
// ============================================================

export async function loadAgentMemory(agentId: string): Promise<AgentMemory | null> {
  if (hasDatabase()) {
    return dbLoadAgentMemory(agentId);
  }
  return fsLoadAgentMemory(agentId);
}

export async function saveAgentProfile(agentId: string, profile: AgentProfile): Promise<void> {
  if (hasDatabase()) {
    return dbSaveAgentProfile(agentId, profile);
  }
  fsSaveAgentProfile(agentId, profile);
}

export async function saveOpponentModel(agentId: string, model: OpponentModel): Promise<void> {
  if (hasDatabase()) {
    return dbSaveOpponentModel(agentId, model);
  }
  fsSaveOpponentModel(agentId, model);
}

export async function saveGameRecord(agentId: string, record: GameRecord): Promise<void> {
  if (hasDatabase()) {
    return dbSaveGameRecord(agentId, record);
  }
  fsSaveGameRecord(agentId, record);
}

export async function saveStrategicInsights(agentId: string, insights: StrategicInsight[]): Promise<void> {
  if (hasDatabase()) {
    return dbSaveStrategicInsights(agentId, insights);
  }
  fsSaveStrategicInsights(agentId, insights);
}

export async function createDefaultAgent(agentId: string, name: string, personality: string): Promise<AgentMemory> {
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

  await saveAgentProfile(agentId, profile);

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
