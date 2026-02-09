import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  serial,
} from 'drizzle-orm/pg-core';

// ============================================================
// Game State Storage
// ============================================================

export const games = pgTable('games', {
  id: text('id').primaryKey(),
  state: jsonb('state').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================
// AI Agent Memory Tables
// ============================================================

export const agentProfiles = pgTable('agent_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  personality: text('personality').notNull(),
  baseStrategy: text('base_strategy').notNull(),
  gamesPlayed: integer('games_played').default(0).notNull(),
  wins: integer('wins').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const opponentModels = pgTable('opponent_models', {
  id: serial('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agentProfiles.id),
  opponentId: text('opponent_id').notNull(),
  opponentName: text('opponent_name').notNull(),
  gamesAgainst: integer('games_against').default(0).notNull(),
  winsAgainst: integer('wins_against').default(0).notNull(),
  observedTendencies: jsonb('observed_tendencies').$type<string[]>().default([]).notNull(),
  strategicNotes: jsonb('strategic_notes').$type<string[]>().default([]).notNull(),
  lastUpdated: timestamp('last_updated').defaultNow().notNull(),
});

export const gameRecords = pgTable('game_records', {
  id: serial('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agentProfiles.id),
  gameId: text('game_id').notNull(),
  date: timestamp('date').defaultNow().notNull(),
  players: jsonb('players').$type<{ id: string; name: string }[]>().notNull(),
  winner: text('winner').notNull(),
  turnCount: integer('turn_count').notNull(),
  keyDecisions: jsonb('key_decisions').$type<string[]>().default([]).notNull(),
  lessonsLearned: jsonb('lessons_learned').$type<string[]>().default([]).notNull(),
  opponentBehaviors: jsonb('opponent_behaviors').$type<{ playerId: string; behavior: string }[]>().default([]).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const strategicInsights = pgTable('strategic_insights', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agentProfiles.id),
  insight: text('insight').notNull(),
  confidence: real('confidence').default(0.5).notNull(),
  timesValidated: integer('times_validated').default(0).notNull(),
  timesContradicted: integer('times_contradicted').default(0).notNull(),
  context: text('context').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
