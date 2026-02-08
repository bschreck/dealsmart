// ============================================================
// AI Player - LLM-Backed Decision Making
//
// Uses Claude Opus 4.6 for strategic game decisions
// with persistent memory for learning across games
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import {
  GameState,
  PlayerView,
  PlayerAction,
  Card,
  PropertySet,
  PropertyColor,
  PendingAction,
  SET_SIZES,
  RENT_VALUES,
  COLOR_NAMES,
} from '../game/types';
import {
  getLegalActions,
  getPlayerView,
  cardDescription,
  isSetComplete,
  getPayableCards,
  autoSelectPayment,
  calculatePaymentValue,
} from '../game/engine';
import {
  AgentMemory,
  loadAgentMemory,
  createDefaultAgent,
  formatMemoryForPrompt,
  saveGameRecord,
  saveOpponentModel,
  saveAgentProfile,
  saveStrategicInsights,
  GameRecord,
  StrategicInsight,
} from './memory/memoryManager';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an expert Monopoly Deal card game player. You play to win by completing 3 property sets of different colors.

## Complete Rules Knowledge
- 106 card deck: 20 money, 28 properties, 11 wildcards, 13 rent, 34 action cards
- Draw 2 cards per turn (5 if hand was empty), play up to 3 cards, hand limit 7
- Win: 3 complete property sets (each needs at least 1 non-wildcard property)
- Property sets: Brown(2), LightBlue(3), Pink(3), Orange(3), Red(3), Yellow(3), Green(3), DarkBlue(2), Railroad(4), Utility(2)
- Action cards can be banked as money instead of played for effect
- Just Say No cancels any action against you (does NOT cost a play)
- Double the Rent is played WITH a rent card (costs an extra play each)
- Deal Breaker steals a COMPLETE set; Sly Deal steals 1 property NOT from a complete set
- Forced Deal swaps properties (neither from complete sets)
- No change given on payments; payer chooses what to pay with
- Rearranging wildcards between your sets is free (not a play)

## Key Strategy Principles
- Build bank before exposing properties (protect against rent/birthday)
- Hold completing pieces in hand until ready to win
- Save Just Say No for Deal Breaker defense
- Track Deal Breakers and Just Say No cards played (only 2 and 3 in deck respectively)
- 2-card sets (Dark Blue, Brown, Utility) are fastest to complete
- Combo rent with Double the Rent for maximum impact
- Target the leader; protect your near-complete sets
- Empty hand = draw 5 next turn (can be strategically exploited)

You must respond ONLY with valid JSON. Think step by step about the game state, then choose the best action.`;

function formatGameStateForAI(view: PlayerView): string {
  const sections: string[] = [];

  sections.push(`## Current Game State (Turn ${view.turnNumber})`);
  sections.push(`Phase: ${view.phase} | Actions Remaining: ${view.actionsRemaining}`);
  sections.push(`Draw Pile: ${view.drawPileCount} cards | It is ${view.currentPlayerId === view.myId ? 'YOUR' : "opponent's"} turn`);

  // My hand
  sections.push(`\n## Your Hand (${view.myHand.length} cards)`);
  for (const card of view.myHand) {
    sections.push(`  - [${card.id}] ${cardDescription(card)} (value: $${card.value}M)`);
  }

  // My bank
  const bankTotal = view.myBank.reduce((sum, c) => sum + c.value, 0);
  sections.push(`\n## Your Bank ($${bankTotal}M total, ${view.myBank.length} cards)`);
  for (const card of view.myBank) {
    sections.push(`  - [${card.id}] ${cardDescription(card)} ($${card.value}M)`);
  }

  // My properties
  sections.push(`\n## Your Properties`);
  if (view.myProperties.length === 0) {
    sections.push(`  (none)`);
  }
  for (const set of view.myProperties) {
    const complete = isSetComplete(set);
    const needed = SET_SIZES[set.color];
    const rentTable = RENT_VALUES[set.color];
    const currentRent = set.cards.length > 0 ? rentTable[Math.min(set.cards.length, rentTable.length) - 1] : 0;
    let rentWithBuildings = currentRent;
    if (set.house) rentWithBuildings += 3;
    if (set.hotel) rentWithBuildings += 4;

    sections.push(`  ${COLOR_NAMES[set.color]} [${set.cards.length}/${needed}]${complete ? ' COMPLETE' : ''} (rent: $${rentWithBuildings}M)${set.house ? ' +House' : ''}${set.hotel ? ' +Hotel' : ''}`);
    for (const card of set.cards) {
      sections.push(`    - [${card.id}] ${cardDescription(card)}`);
    }
  }

  // Opponents
  sections.push(`\n## Opponents`);
  for (const opp of view.opponents) {
    const oppBank = opp.bank.reduce((sum, c) => sum + c.value, 0);
    const completeSets = opp.properties.filter(isSetComplete).length;
    sections.push(`\n  ### ${opp.name} (${opp.id}) - ${opp.handCount} cards in hand, $${oppBank}M in bank, ${completeSets} complete sets`);
    for (const set of opp.properties) {
      const complete = isSetComplete(set);
      const needed = SET_SIZES[set.color];
      sections.push(`    ${COLOR_NAMES[set.color]} [${set.cards.length}/${needed}]${complete ? ' COMPLETE' : ''}${set.house ? ' +House' : ''}${set.hotel ? ' +Hotel' : ''}`);
      for (const card of set.cards) {
        sections.push(`      - [${card.id}] ${cardDescription(card)}`);
      }
    }
  }

  // Pending action
  if (view.pendingAction) {
    sections.push(`\n## PENDING ACTION - You Must Respond!`);
    const pa = view.pendingAction;
    sections.push(`  Type: ${pa.type}`);
    sections.push(`  From: ${pa.sourcePlayerId}`);
    if (pa.amount) sections.push(`  Amount: $${pa.amount}M`);
    if (pa.targetCardId) sections.push(`  Target Card: ${pa.targetCardId}`);
    if (pa.targetSetColor) sections.push(`  Target Set: ${pa.targetSetColor}`);
  }

  // Recent log
  if (view.log.length > 0) {
    sections.push(`\n## Recent Actions`);
    for (const entry of view.log.slice(-8)) {
      sections.push(`  Turn ${entry.turnNumber}: ${entry.playerId} - ${entry.action}${entry.details ? ': ' + entry.details : ''}`);
    }
  }

  return sections.join('\n');
}

function formatLegalActions(actions: PlayerAction[]): string {
  if (actions.length === 0) return 'No legal actions available.';

  const lines: string[] = ['## Legal Actions (choose one by index)'];

  // Deduplicate and simplify for the AI
  const simplified: { index: number; description: string; action: PlayerAction }[] = [];

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    let desc = '';
    switch (a.type) {
      case 'playCard':
        desc = a.asBank ? `Bank card ${a.cardId} as money` : `Play card ${a.cardId}`;
        break;
      case 'playDebtCollector':
        desc = `Debt Collector: demand $5M from ${a.targetPlayerId}`;
        break;
      case 'playProperty':
        desc = a.color ? `Play property ${a.cardId} as ${a.color}` : `Play property ${a.cardId}`;
        break;
      case 'playRent':
        desc = `Charge ${a.targetColor} rent${a.targetPlayerId ? ` to ${a.targetPlayerId}` : ' to all'}${a.doubleCardIds ? ` (doubled x${a.doubleCardIds.length})` : ''}`;
        break;
      case 'playSlyDeal':
        desc = `Sly Deal: steal ${a.targetCardId} from ${a.targetPlayerId}`;
        break;
      case 'playForcedDeal':
        desc = `Forced Deal: give ${a.offeredCardId} to ${a.targetPlayerId}, take ${a.targetCardId}`;
        break;
      case 'playDealBreaker':
        desc = `Deal Breaker: steal ${a.targetPlayerId}'s ${a.targetColor} set`;
        break;
      case 'playHouse':
        desc = `Place House on ${a.targetColor} set`;
        break;
      case 'playHotel':
        desc = `Place Hotel on ${a.targetColor} set`;
        break;
      case 'respondJustSayNo':
        desc = `Play Just Say No (${a.cardId})`;
        break;
      case 'respondPay':
        desc = `Pay the amount owed (select cards)`;
        break;
      case 'respondAccept':
        desc = `Accept the action (don't block)`;
        break;
      case 'rearrangeWildcard':
        desc = `Move wildcard ${a.cardId} from ${a.fromColor} to ${a.toColor} (free)`;
        break;
      case 'endTurn':
        desc = `End your turn`;
        break;
      case 'discard':
        desc = `Discard cards to get to 7`;
        break;
    }
    simplified.push({ index: i, description: desc, action: a });
  }

  for (const s of simplified) {
    lines.push(`  [${s.index}] ${s.description}`);
  }

  return lines.join('\n');
}

export async function getAIDecision(
  state: GameState,
  playerId: string,
): Promise<PlayerAction> {
  const player = state.players.find(p => p.id === playerId)!;
  const view = getPlayerView(state, playerId);
  const legalActions = getLegalActions(state, playerId);

  if (legalActions.length === 0) {
    throw new Error('No legal actions available');
  }

  if (legalActions.length === 1) {
    return legalActions[0];
  }

  // Handle payment responses - use auto-select for simplicity with AI
  if (legalActions.some(a => a.type === 'respondPay')) {
    const pending = state.pendingAction!;
    const amount = pending.amount || 0;

    // Check if we should Just Say No
    const jsnActions = legalActions.filter(a => a.type === 'respondJustSayNo');
    if (jsnActions.length > 0 && amount >= 5) {
      // AI logic: use Just Say No for high amounts or Deal Breaker
      const shouldBlock = pending.type === 'dealBreaker' ||
        (pending.type === 'rent' && amount >= 8) ||
        (pending.type === 'debtCollector' && amount >= 5 && player.bank.length < 3);

      if (shouldBlock) {
        return jsnActions[0];
      }
    }

    // Auto-select payment
    const paymentCards = autoSelectPayment(player, amount);
    return { type: 'respondPay', cardIds: paymentCards };
  }

  // Handle discard - discard lowest value cards
  if (legalActions.some(a => a.type === 'discard')) {
    const excess = player.hand.length - 7;
    const sorted = [...player.hand].sort((a, b) => a.value - b.value);
    const discardIds = sorted.slice(0, excess).map(c => c.id);
    return { type: 'discard', cardIds: discardIds };
  }

  // Load memory
  const agentId = player.aiPersonality || 'default';
  let memory = loadAgentMemory(agentId);
  if (!memory) {
    memory = createDefaultAgent(agentId, player.name, agentId);
  }

  const opponentIds = view.opponents.map(o => o.id);
  const memoryContext = formatMemoryForPrompt(memory, opponentIds);

  const gameStateStr = formatGameStateForAI(view);
  const actionsStr = formatLegalActions(legalActions);

  const userMessage = `${memoryContext}

${gameStateStr}

${actionsStr}

Think through your decision step by step:
1. Assess the current board state and threats
2. Consider your strategic goals (which sets to complete, what to protect)
3. Evaluate each promising action's risk/reward
4. Choose the best action index

Respond with JSON: {"thinking": "your reasoning", "actionIndex": <number>}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const idx = parseInt(parsed.actionIndex);
      if (idx >= 0 && idx < legalActions.length) {
        return legalActions[idx];
      }
    }
  } catch (error) {
    console.error('AI decision error:', error);
  }

  // Fallback: use heuristic
  return heuristicDecision(state, playerId, legalActions);
}

// Heuristic fallback when LLM is unavailable
function heuristicDecision(state: GameState, playerId: string, actions: PlayerAction[]): PlayerAction {
  const player = state.players.find(p => p.id === playerId)!;

  // Priority order for play phase
  // 1. Play Pass Go (card advantage)
  const passGo = actions.find(a =>
    a.type === 'playCard' && !a.asBank &&
    player.hand.find(c => c.id === a.cardId)?.type === 'action' &&
    (player.hand.find(c => c.id === a.cardId) as any)?.action === 'passGo'
  );
  if (passGo) return passGo;

  // 2. Play properties
  const playProp = actions.find(a => a.type === 'playProperty');
  if (playProp) return playProp;

  // 3. Bank money
  const bankMoney = actions.find(a =>
    a.type === 'playCard' && !a.asBank &&
    player.hand.find(c => c.id === a.cardId)?.type === 'money'
  );
  if (bankMoney) return bankMoney;

  // 4. Bank action cards
  const bankAction = actions.find(a => a.type === 'playCard' && a.asBank);
  if (bankAction) return bankAction;

  // 5. End turn
  const endTurn = actions.find(a => a.type === 'endTurn');
  if (endTurn) return endTurn;

  // 6. Accept/pay
  const accept = actions.find(a => a.type === 'respondAccept');
  if (accept) return accept;

  return actions[0];
}

// Post-game memory update
export async function updateMemoryAfterGame(
  state: GameState,
  agentPlayerId: string,
): Promise<void> {
  const player = state.players.find(p => p.id === agentPlayerId)!;
  const agentId = player.aiPersonality || 'default';
  let memory = loadAgentMemory(agentId);
  if (!memory) return;

  const won = state.winner === agentPlayerId;

  // Update profile stats
  memory.profile.gamesPlayed++;
  if (won) memory.profile.wins++;
  memory.profile.updatedAt = new Date().toISOString();
  saveAgentProfile(agentId, memory.profile);

  // Save game record
  const record: GameRecord = {
    gameId: state.id,
    date: new Date().toISOString(),
    players: state.players.map(p => ({ id: p.id, name: p.name })),
    winner: state.winner || '',
    turnCount: state.turnNumber,
    keyDecisions: [],
    lessonsLearned: [],
    opponentBehaviors: [],
  };

  // Use LLM to reflect on the game if available
  try {
    const gameLog = state.log.map(e =>
      `Turn ${e.turnNumber}: ${e.playerId} - ${e.action}${e.details ? ': ' + e.details : ''}`
    ).join('\n');

    const reflectionPrompt = `You just ${won ? 'won' : 'lost'} a Monopoly Deal game as "${player.name}".

Game log:
${gameLog}

Reflect on this game. Respond with JSON:
{
  "keyDecisions": ["decision 1", "decision 2"],
  "lessonsLearned": ["lesson 1", "lesson 2"],
  "opponentBehaviors": [{"playerId": "id", "behavior": "description"}],
  "newInsights": [{"insight": "text", "confidence": 0.0-1.0}],
  "strategyUpdate": "any update to base strategy, or null"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: 'You are reflecting on a Monopoly Deal game you just played. Extract strategic insights. Respond only with JSON.',
      messages: [{ role: 'user', content: reflectionPrompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const reflection = JSON.parse(jsonMatch[0]);

      record.keyDecisions = reflection.keyDecisions || [];
      record.lessonsLearned = reflection.lessonsLearned || [];
      record.opponentBehaviors = reflection.opponentBehaviors || [];

      // Update opponent models
      for (const obs of reflection.opponentBehaviors || []) {
        const existing = memory.opponentModels[obs.playerId];
        if (existing) {
          existing.gamesAgainst++;
          if (won) existing.winsAgainst++;
          existing.observedTendencies.push(obs.behavior);
          // Keep last 10 observations
          if (existing.observedTendencies.length > 10) {
            existing.observedTendencies = existing.observedTendencies.slice(-10);
          }
          existing.lastUpdated = new Date().toISOString();
          saveOpponentModel(agentId, existing);
        } else {
          const opponent = state.players.find(p => p.id === obs.playerId);
          if (opponent) {
            const newModel = {
              opponentId: obs.playerId,
              opponentName: opponent.name,
              gamesAgainst: 1,
              winsAgainst: won ? 1 : 0,
              observedTendencies: [obs.behavior],
              strategicNotes: [],
              lastUpdated: new Date().toISOString(),
            };
            memory.opponentModels[obs.playerId] = newModel;
            saveOpponentModel(agentId, newModel);
          }
        }
      }

      // Update strategic insights
      if (reflection.newInsights) {
        for (const ins of reflection.newInsights) {
          const existing = memory.strategicInsights.find(i =>
            i.insight.toLowerCase().includes(ins.insight.toLowerCase().slice(0, 30))
          );
          if (existing) {
            existing.timesValidated++;
            existing.confidence = Math.min(1, existing.confidence + 0.1);
            existing.updatedAt = new Date().toISOString();
          } else {
            memory.strategicInsights.push({
              id: `insight_${Date.now()}`,
              insight: ins.insight,
              confidence: ins.confidence || 0.5,
              timesValidated: 1,
              timesContradicted: 0,
              context: `Game ${state.id}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        }
        saveStrategicInsights(agentId, memory.strategicInsights);
      }

      // Update base strategy if suggested
      if (reflection.strategyUpdate && reflection.strategyUpdate !== 'null') {
        memory.profile.baseStrategy += '\n\n## Learned Update\n' + reflection.strategyUpdate;
        saveAgentProfile(agentId, memory.profile);
      }
    }
  } catch (error) {
    console.error('Memory reflection error:', error);
  }

  saveGameRecord(agentId, record);
}
