// ============================================================
// Game API Routes
// POST /api/game - Create new game
// GET /api/game?id=xxx - Get game state
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createGame, startGame, getPlayerView, PlayerConfig } from '@/game/engine';
import { createDefaultAgent, loadAgentMemory } from '@/ai/memory/memoryManager';
import { games } from '@/game/store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerName, aiCount = 2, aiPersonalities } = body;

    const personalities = aiPersonalities || ['aggressive', 'balanced', 'defensive'];
    const aiNames = ['Alex (Aggressive)', 'Bailey (Balanced)', 'Casey (Defensive)'];

    const configs: PlayerConfig[] = [
      { name: playerName || 'You', isAI: false },
    ];

    for (let i = 0; i < Math.min(aiCount, 4); i++) {
      const personality = personalities[i] || 'balanced';
      const name = aiNames[i] || `AI ${i + 1}`;
      configs.push({ name, isAI: true, aiPersonality: personality });

      // Ensure AI agent memory exists
      const memory = loadAgentMemory(personality);
      if (!memory) {
        createDefaultAgent(personality, name, personality);
      }
    }

    let state = createGame(configs);
    state = startGame(state);
    games.set(state.id, state);

    const view = getPlayerView(state, 'player_0');

    return NextResponse.json({
      gameId: state.id,
      view,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('id');
  const playerId = searchParams.get('playerId') || 'player_0';

  if (!gameId) {
    return NextResponse.json({ error: 'Game ID required' }, { status: 400 });
  }

  const state = games.get(gameId);
  if (!state) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const view = getPlayerView(state, playerId);
  return NextResponse.json({ view });
}
