// ============================================================
// Game Action API Route
// POST /api/game/action - Execute a player action
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { applyAction, getPlayerView, getLegalActions, isSetComplete } from '@/game/engine';
import { GameState, PlayerAction } from '@/game/types';
import { getAIDecision, updateMemoryAfterGame } from '@/ai/aiPlayer';
import { games } from '@/game/store';
import { autoSelectPayment } from '@/game/engine';

async function processAITurns(state: GameState): Promise<GameState> {
  let currentState = state;
  let safety = 0;

  while (safety < 100) {
    safety++;

    if (currentState.winner) break;

    const currentPlayer = currentState.players[currentState.currentPlayerIndex];

    // If it's a human player's turn in play phase, stop
    if (!currentPlayer.isAI && currentState.phase === 'play') break;
    if (!currentPlayer.isAI && currentState.phase === 'discard') break;

    // If waiting for human response, stop
    if (currentState.phase === 'waitingForResponse' && currentState.pendingAction) {
      const pending = currentState.pendingAction;
      const waitingFor = pending.targetPlayerIds.filter(
        id => !pending.respondedPlayers.includes(id)
      );
      const hasHumanWaiting = waitingFor.some(
        id => !currentState.players.find(p => p.id === id)?.isAI
      );
      if (hasHumanWaiting) break;

      // AI responds to pending action
      for (const aiId of waitingFor) {
        const aiPlayer = currentState.players.find(p => p.id === aiId);
        if (!aiPlayer?.isAI) continue;

        const legalActions = getLegalActions(currentState, aiId);
        if (legalActions.length === 0) continue;

        let aiAction: PlayerAction;
        try {
          aiAction = await getAIDecision(currentState, aiId);
        } catch {
          // Fallback for payment
          if (legalActions.some(a => a.type === 'respondPay')) {
            const payCards = autoSelectPayment(aiPlayer, currentState.pendingAction?.amount || 0);
            aiAction = { type: 'respondPay', cardIds: payCards };
          } else if (legalActions.some(a => a.type === 'respondAccept')) {
            aiAction = { type: 'respondAccept' };
          } else {
            aiAction = legalActions[0];
          }
        }

        currentState = applyAction(currentState, aiId, aiAction);
      }
      continue;
    }

    // AI's turn to play
    if (currentPlayer.isAI && currentState.phase === 'play') {
      try {
        const aiAction = await getAIDecision(currentState, currentPlayer.id);
        currentState = applyAction(currentState, currentPlayer.id, aiAction);
      } catch (error) {
        console.error(`AI ${currentPlayer.id} error:`, error);
        // End turn on error
        currentState = applyAction(currentState, currentPlayer.id, { type: 'endTurn' });
      }
      continue;
    }

    // AI discard phase
    if (currentPlayer.isAI && currentState.phase === 'discard') {
      const excess = currentPlayer.hand.length - 7;
      if (excess > 0) {
        const sorted = [...currentPlayer.hand].sort((a, b) => a.value - b.value);
        const discardIds = sorted.slice(0, excess).map(c => c.id);
        currentState = applyAction(currentState, currentPlayer.id, { type: 'discard', cardIds: discardIds });
      }
      continue;
    }

    // Draw phase auto-advances, so if we get here just break
    break;
  }

  return currentState;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, playerId, action } = body as {
      gameId: string;
      playerId: string;
      action: PlayerAction;
    };

    let state = games.get(gameId);
    if (!state) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Apply the human player's action
    state = applyAction(state, playerId, action);

    // Process AI turns
    state = await processAITurns(state);

    // Update game store
    games.set(gameId, state);

    // If game over, update AI memories
    if (state.winner) {
      for (const player of state.players) {
        if (player.isAI) {
          try {
            await updateMemoryAfterGame(state, player.id);
          } catch (error) {
            console.error(`Memory update error for ${player.id}:`, error);
          }
        }
      }
    }

    const view = getPlayerView(state, playerId);
    return NextResponse.json({ view });
  } catch (error: any) {
    console.error('Action error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
