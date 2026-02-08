// ============================================================
// Monopoly Deal - Game Engine
// Pure functions that advance game state
// ============================================================

import { v4 as uuid } from 'uuid';
import {
  GameState,
  Player,
  PlayerView,
  OpponentView,
  PlayerAction,
  Card,
  PropertyCard,
  WildcardCard,
  ActionCard,
  RentCard,
  PropertySet,
  PropertyColor,
  PendingAction,
  GameLogEntry,
  SET_SIZES,
  RENT_VALUES,
} from './types';
import { createDeck, shuffleDeck } from './cards';

// ============================================================
// Game Initialization
// ============================================================

export interface PlayerConfig {
  name: string;
  isAI: boolean;
  aiPersonality?: string;
}

export function createGame(playerConfigs: PlayerConfig[]): GameState {
  if (playerConfigs.length < 2 || playerConfigs.length > 5) {
    throw new Error('Monopoly Deal requires 2-5 players');
  }

  const deck = shuffleDeck(createDeck());
  const players: Player[] = playerConfigs.map((config, i) => ({
    id: `player_${i}`,
    name: config.name,
    hand: [],
    bank: [],
    properties: [],
    isAI: config.isAI,
    aiPersonality: config.aiPersonality,
  }));

  // Deal 5 cards to each player
  let drawIndex = 0;
  for (const player of players) {
    player.hand = deck.slice(drawIndex, drawIndex + 5);
    drawIndex += 5;
  }

  return {
    id: uuid(),
    players,
    drawPile: deck.slice(drawIndex),
    discardPile: [],
    currentPlayerIndex: 0,
    phase: 'draw',
    actionsRemaining: 3,
    pendingAction: null,
    winner: null,
    turnNumber: 1,
    log: [],
  };
}

// ============================================================
// View Generation (hide private info)
// ============================================================

export function getPlayerView(state: GameState, playerId: string): PlayerView {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error(`Player ${playerId} not found`);

  const opponents: OpponentView[] = state.players
    .filter(p => p.id !== playerId)
    .map(p => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
      bank: p.bank,
      properties: p.properties,
      isAI: p.isAI,
    }));

  return {
    gameId: state.id,
    myId: playerId,
    myHand: player.hand,
    myBank: player.bank,
    myProperties: player.properties,
    opponents,
    drawPileCount: state.drawPile.length,
    discardPile: state.discardPile,
    currentPlayerIndex: state.currentPlayerIndex,
    currentPlayerId: state.players[state.currentPlayerIndex].id,
    phase: state.phase,
    actionsRemaining: state.actionsRemaining,
    pendingAction: state.pendingAction,
    winner: state.winner,
    turnNumber: state.turnNumber,
    log: state.log.slice(-20),
  };
}

// ============================================================
// Helper Functions
// ============================================================

function addLog(state: GameState, playerId: string, action: string, details?: string): void {
  state.log.push({
    turnNumber: state.turnNumber,
    playerId,
    action,
    details,
    timestamp: Date.now(),
  });
}

function getPlayer(state: GameState, playerId: string): Player {
  const p = state.players.find(p => p.id === playerId);
  if (!p) throw new Error(`Player ${playerId} not found`);
  return p;
}

function removeCardFromHand(player: Player, cardId: string): Card {
  const idx = player.hand.findIndex(c => c.id === cardId);
  if (idx === -1) throw new Error(`Card ${cardId} not in hand`);
  return player.hand.splice(idx, 1)[0];
}

function removeCardFromBank(player: Player, cardId: string): Card {
  const idx = player.bank.findIndex(c => c.id === cardId);
  if (idx === -1) throw new Error(`Card ${cardId} not in bank`);
  return player.bank.splice(idx, 1)[0];
}

function findCardInProperties(player: Player, cardId: string): { set: PropertySet; cardIndex: number } | null {
  for (const set of player.properties) {
    const idx = set.cards.findIndex(c => c.id === cardId);
    if (idx !== -1) return { set, cardIndex: idx };
  }
  return null;
}

function removeCardFromProperties(player: Player, cardId: string): { card: Card; fromColor: PropertyColor } | null {
  for (let si = 0; si < player.properties.length; si++) {
    const set = player.properties[si];
    const ci = set.cards.findIndex(c => c.id === cardId);
    if (ci !== -1) {
      const card = set.cards.splice(ci, 1)[0];
      const fromColor = set.color;
      if (set.cards.length === 0) {
        // Move house/hotel to player's property area as orphans
        // For simplicity, we remove the empty set
        player.properties.splice(si, 1);
      }
      return { card, fromColor };
    }
  }
  return null;
}

export function isSetComplete(set: PropertySet): boolean {
  const required = SET_SIZES[set.color];
  const hasStandardProperty = set.cards.some(c => c.type === 'property');
  return set.cards.length >= required && hasStandardProperty;
}

function getCompleteSets(player: Player): PropertySet[] {
  return player.properties.filter(isSetComplete);
}

export function countCompleteSets(player: Player): number {
  return getCompleteSets(player).length;
}

function checkWinCondition(state: GameState): string | null {
  for (const player of state.players) {
    if (countCompleteSets(player) >= 3) {
      return player.id;
    }
  }
  return null;
}

function addPropertyToPlayer(player: Player, card: PropertyCard | WildcardCard, color: PropertyColor): void {
  // Find existing set of this color, or create one
  let set = player.properties.find(s => s.color === color && !isSetComplete(s));
  if (!set) {
    // Check if there's a complete set that still has room (overflow)
    // Actually, if set is complete, new cards start a new partial set
    set = { color, cards: [], house: false, hotel: false };
    player.properties.push(set);
  }
  if (card.type === 'wildcard') {
    card.currentColor = color;
  }
  set.cards.push(card);
}

function getRentForSet(set: PropertySet): number {
  const rentTable = RENT_VALUES[set.color];
  const count = Math.min(set.cards.length, rentTable.length);
  if (count === 0) return 0;
  let rent = rentTable[count - 1];
  if (set.house) rent += 3;
  if (set.hotel) rent += 4;
  return rent;
}

function ensureDrawPile(state: GameState): void {
  if (state.drawPile.length === 0 && state.discardPile.length > 0) {
    state.drawPile = shuffleDeck(state.discardPile);
    state.discardPile = [];
  }
}

function drawCards(state: GameState, count: number): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < count; i++) {
    ensureDrawPile(state);
    if (state.drawPile.length > 0) {
      cards.push(state.drawPile.pop()!);
    }
  }
  return cards;
}

export function getCardValue(card: Card): number {
  return card.value;
}

function getTotalTableValue(player: Player): number {
  let total = 0;
  for (const card of player.bank) {
    total += getCardValue(card);
  }
  for (const set of player.properties) {
    for (const card of set.cards) {
      total += getCardValue(card);
    }
    if (set.house) total += 3;
    if (set.hotel) total += 4;
  }
  return total;
}

// ============================================================
// Legal Move Generation
// ============================================================

export function getLegalActions(state: GameState, playerId: string): PlayerAction[] {
  const player = getPlayer(state, playerId);
  const currentPlayer = state.players[state.currentPlayerIndex];
  const actions: PlayerAction[] = [];

  // If waiting for response to a pending action
  if (state.phase === 'waitingForResponse' && state.pendingAction) {
    const pending = state.pendingAction;

    // Check if this player needs to respond
    if (pending.targetPlayerIds.includes(playerId) && !pending.respondedPlayers.includes(playerId)) {
      // Check for Just Say No chain
      if (pending.justSayNoChain && pending.justSayNoChain.targetId === playerId) {
        // Player can counter with their own Just Say No
        const jsn = player.hand.filter(c => c.type === 'action' && c.action === 'justSayNo');
        for (const card of jsn) {
          actions.push({ type: 'respondJustSayNo', cardId: card.id });
        }
        actions.push({ type: 'respondAccept' }); // accept the action
        return actions;
      }

      // Player can play Just Say No
      const justSayNos = player.hand.filter(c => c.type === 'action' && c.action === 'justSayNo');
      for (const card of justSayNos) {
        actions.push({ type: 'respondJustSayNo', cardId: card.id });
      }

      // For payment actions, player must choose cards to pay
      if (['debtCollector', 'itIsMyBirthday', 'rent'].includes(pending.type)) {
        // Generate payment options - player must pay with table cards
        actions.push({ type: 'respondPay', cardIds: [] }); // placeholder - UI handles card selection
      }

      // Can always accept (decline to use Just Say No)
      if (pending.type === 'slyDeal' || pending.type === 'forcedDeal' || pending.type === 'dealBreaker') {
        actions.push({ type: 'respondAccept' });
      }

      return actions;
    }
    return [];
  }

  // Not this player's turn
  if (currentPlayer.id !== playerId) return [];

  // Draw phase
  if (state.phase === 'draw') {
    // Drawing is automatic, no actions needed
    return [];
  }

  // Discard phase
  if (state.phase === 'discard') {
    if (player.hand.length > 7) {
      // Must discard down to 7
      // UI will handle multi-select
      actions.push({ type: 'discard', cardIds: [] });
    }
    return actions;
  }

  // Play phase
  if (state.phase === 'play') {
    // Can always end turn
    actions.push({ type: 'endTurn' });

    if (state.actionsRemaining <= 0) return actions;

    // Free action: rearrange wildcards
    for (const set of player.properties) {
      for (const card of set.cards) {
        if (card.type === 'wildcard') {
          const possibleColors = card.colors === 'all'
            ? (['brown', 'lightBlue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkBlue', 'railroad', 'utility'] as PropertyColor[])
            : card.colors;
          for (const toColor of possibleColors) {
            if (toColor !== set.color) {
              actions.push({
                type: 'rearrangeWildcard',
                cardId: card.id,
                fromColor: set.color,
                toColor,
              });
            }
          }
        }
      }
    }

    for (const card of player.hand) {
      // Any card can be banked (as money)
      if (card.type !== 'property') {
        actions.push({ type: 'playCard', cardId: card.id, asBank: true });
      }

      switch (card.type) {
        case 'money':
          // Money always goes to bank
          actions.push({ type: 'playCard', cardId: card.id });
          break;

        case 'property':
          actions.push({ type: 'playProperty', cardId: card.id });
          break;

        case 'wildcard': {
          const colors = card.colors === 'all'
            ? ['brown', 'lightBlue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkBlue', 'railroad', 'utility'] as PropertyColor[]
            : card.colors;
          for (const color of colors) {
            actions.push({ type: 'playProperty', cardId: card.id, color });
          }
          break;
        }

        case 'rent': {
          const rentColors = card.colors === 'all'
            ? ['brown', 'lightBlue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkBlue', 'railroad', 'utility'] as PropertyColor[]
            : card.colors;
          // Can only charge rent for colors you have properties in
          for (const color of rentColors) {
            const hasColor = player.properties.some(s => s.color === color && s.cards.length > 0);
            if (hasColor) {
              if (card.colors === 'all') {
                // Wild rent targets one player
                for (const opp of state.players) {
                  if (opp.id !== playerId) {
                    // Check for double the rent cards in hand
                    const doubleCards = player.hand.filter(c => c.type === 'action' && c.action === 'doubleTheRent');
                    actions.push({ type: 'playRent', cardId: card.id, targetColor: color, targetPlayerId: opp.id });
                    // With double(s)
                    if (doubleCards.length >= 1 && state.actionsRemaining >= 2) {
                      actions.push({
                        type: 'playRent', cardId: card.id, targetColor: color,
                        targetPlayerId: opp.id, doubleCardIds: [doubleCards[0].id],
                      });
                    }
                    if (doubleCards.length >= 2 && state.actionsRemaining >= 3) {
                      actions.push({
                        type: 'playRent', cardId: card.id, targetColor: color,
                        targetPlayerId: opp.id, doubleCardIds: [doubleCards[0].id, doubleCards[1].id],
                      });
                    }
                  }
                }
              } else {
                // Dual-color rent targets all players
                const doubleCards = player.hand.filter(c => c.type === 'action' && c.action === 'doubleTheRent');
                actions.push({ type: 'playRent', cardId: card.id, targetColor: color });
                if (doubleCards.length >= 1 && state.actionsRemaining >= 2) {
                  actions.push({
                    type: 'playRent', cardId: card.id, targetColor: color,
                    doubleCardIds: [doubleCards[0].id],
                  });
                }
                if (doubleCards.length >= 2 && state.actionsRemaining >= 3) {
                  actions.push({
                    type: 'playRent', cardId: card.id, targetColor: color,
                    doubleCardIds: [doubleCards[0].id, doubleCards[1].id],
                  });
                }
              }
            }
          }
          break;
        }

        case 'action': {
          switch (card.action) {
            case 'passGo':
              actions.push({ type: 'playCard', cardId: card.id });
              break;

            case 'debtCollector':
              for (const opp of state.players) {
                if (opp.id !== playerId) {
                  actions.push({ type: 'playDebtCollector', cardId: card.id, targetPlayerId: opp.id });
                }
              }
              break;

            case 'itIsMyBirthday':
              actions.push({ type: 'playCard', cardId: card.id });
              break;

            case 'slyDeal':
              // Can steal any property NOT in a complete set
              for (const opp of state.players) {
                if (opp.id === playerId) continue;
                for (const set of opp.properties) {
                  if (isSetComplete(set)) continue;
                  for (const propCard of set.cards) {
                    actions.push({
                      type: 'playSlyDeal',
                      cardId: card.id,
                      targetPlayerId: opp.id,
                      targetCardId: propCard.id,
                    });
                  }
                }
              }
              break;

            case 'forcedDeal':
              // Swap one of your properties for one of theirs (not from complete sets)
              for (const opp of state.players) {
                if (opp.id === playerId) continue;
                for (const oppSet of opp.properties) {
                  if (isSetComplete(oppSet)) continue;
                  for (const oppCard of oppSet.cards) {
                    for (const mySet of player.properties) {
                      if (isSetComplete(mySet)) continue;
                      for (const myCard of mySet.cards) {
                        actions.push({
                          type: 'playForcedDeal',
                          cardId: card.id,
                          targetPlayerId: opp.id,
                          targetCardId: oppCard.id,
                          offeredCardId: myCard.id,
                        });
                      }
                    }
                  }
                }
              }
              break;

            case 'dealBreaker':
              // Steal a complete set
              for (const opp of state.players) {
                if (opp.id === playerId) continue;
                for (const set of opp.properties) {
                  if (isSetComplete(set)) {
                    actions.push({
                      type: 'playDealBreaker',
                      cardId: card.id,
                      targetPlayerId: opp.id,
                      targetColor: set.color,
                    });
                  }
                }
              }
              break;

            case 'house':
              // Place on complete set (not railroad/utility)
              for (const set of player.properties) {
                if (isSetComplete(set) && !set.house && set.color !== 'railroad' && set.color !== 'utility') {
                  actions.push({ type: 'playHouse', cardId: card.id, targetColor: set.color });
                }
              }
              break;

            case 'hotel':
              // Place on complete set with house (not railroad/utility)
              for (const set of player.properties) {
                if (isSetComplete(set) && set.house && !set.hotel && set.color !== 'railroad' && set.color !== 'utility') {
                  actions.push({ type: 'playHotel', cardId: card.id, targetColor: set.color });
                }
              }
              break;

            case 'justSayNo':
              // Played reactively only, can bank it
              break;

            case 'doubleTheRent':
              // Played with rent cards only, handled in rent section
              break;
          }
          break;
        }
      }
    }
  }

  return actions;
}

// ============================================================
// State Transitions
// ============================================================

export function applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
  // Deep clone state
  const newState: GameState = JSON.parse(JSON.stringify(state));
  const player = getPlayer(newState, playerId);

  switch (action.type) {
    case 'playCard': {
      const card = removeCardFromHand(player, action.cardId);

      if (action.asBank || card.type === 'money') {
        // Bank the card
        player.bank.push(card);
        addLog(newState, playerId, 'bank', `Banked ${cardDescription(card)} ($${card.value}M)`);
        newState.actionsRemaining--;
      } else if (card.type === 'action') {
        switch (card.action) {
          case 'passGo': {
            newState.discardPile.push(card);
            const drawn = drawCards(newState, 2);
            player.hand.push(...drawn);
            addLog(newState, playerId, 'passGo', `Drew 2 cards`);
            newState.actionsRemaining--;
            break;
          }
          case 'debtCollector': {
            newState.discardPile.push(card);
            // Target the opponent with the most table value (for single-target, UI refines)
            const opponents = newState.players.filter(p => p.id !== playerId);
            if (opponents.length > 0) {
              // Default: target richest opponent (AI will specify)
              const target = opponents.reduce((a, b) =>
                getTotalTableValue(b) > getTotalTableValue(a) ? b : a
              );
              newState.pendingAction = {
                type: 'debtCollector',
                sourcePlayerId: playerId,
                targetPlayerIds: [target.id],
                amount: 5,
                card,
                respondedPlayers: [],
              };
              newState.phase = 'waitingForResponse';
              addLog(newState, playerId, 'debtCollector', `Demands $5M from ${target.name}`);
            }
            newState.actionsRemaining--;
            break;
          }
          case 'itIsMyBirthday': {
            newState.discardPile.push(card);
            const targetIds = newState.players.filter(p => p.id !== playerId).map(p => p.id);
            newState.pendingAction = {
              type: 'itIsMyBirthday',
              sourcePlayerId: playerId,
              targetPlayerIds: targetIds,
              amount: 2,
              card,
              respondedPlayers: [],
            };
            newState.phase = 'waitingForResponse';
            addLog(newState, playerId, 'birthday', `It's My Birthday! All opponents pay $2M`);
            newState.actionsRemaining--;
            break;
          }
          default:
            // Bank it if played generically
            player.bank.push(card);
            addLog(newState, playerId, 'bank', `Banked ${cardDescription(card)}`);
            newState.actionsRemaining--;
        }
      }
      break;
    }

    case 'playDebtCollector': {
      const dcCard = removeCardFromHand(player, action.cardId);
      newState.discardPile.push(dcCard);
      const dcTarget = getPlayer(newState, action.targetPlayerId);
      newState.pendingAction = {
        type: 'debtCollector',
        sourcePlayerId: playerId,
        targetPlayerIds: [action.targetPlayerId],
        amount: 5,
        card: dcCard,
        respondedPlayers: [],
      };
      newState.phase = 'waitingForResponse';
      addLog(newState, playerId, 'debtCollector', `Demands $5M from ${dcTarget.name}`);
      newState.actionsRemaining--;
      break;
    }

    case 'playProperty': {
      const card = removeCardFromHand(player, action.cardId);
      if (card.type === 'property') {
        addPropertyToPlayer(player, card, card.color);
        addLog(newState, playerId, 'property', `Played ${card.name}`);
      } else if (card.type === 'wildcard') {
        const color = action.color!;
        addPropertyToPlayer(player, card as WildcardCard, color);
        addLog(newState, playerId, 'wildcard', `Played wildcard as ${color}`);
      }
      newState.actionsRemaining--;
      break;
    }

    case 'playRent': {
      const card = removeCardFromHand(player, action.cardId) as RentCard;
      newState.discardPile.push(card);

      let doubleCount = 0;
      if (action.doubleCardIds) {
        for (const dId of action.doubleCardIds) {
          const dCard = removeCardFromHand(player, dId);
          newState.discardPile.push(dCard);
          doubleCount++;
          newState.actionsRemaining--;
        }
      }

      // Calculate rent
      const colorSet = player.properties.find(s => s.color === action.targetColor);
      let rentAmount = colorSet ? getRentForSet(colorSet) : 0;
      for (let i = 0; i < doubleCount; i++) rentAmount *= 2;

      let targetIds: string[];
      if (action.targetPlayerId) {
        targetIds = [action.targetPlayerId];
      } else {
        targetIds = newState.players.filter(p => p.id !== playerId).map(p => p.id);
      }

      newState.pendingAction = {
        type: 'rent',
        sourcePlayerId: playerId,
        targetPlayerIds: targetIds,
        amount: rentAmount,
        rentCard: card,
        doubleCount,
        respondedPlayers: [],
      };
      newState.phase = 'waitingForResponse';
      const doubleStr = doubleCount > 0 ? ` (x${Math.pow(2, doubleCount)})` : '';
      addLog(newState, playerId, 'rent', `Charges $${rentAmount}M rent for ${action.targetColor}${doubleStr}`);
      newState.actionsRemaining--;
      break;
    }

    case 'playSlyDeal': {
      const card = removeCardFromHand(player, action.cardId);
      newState.discardPile.push(card);
      newState.pendingAction = {
        type: 'slyDeal',
        sourcePlayerId: playerId,
        targetPlayerIds: [action.targetPlayerId],
        card,
        targetCardId: action.targetCardId,
        respondedPlayers: [],
      };
      newState.phase = 'waitingForResponse';
      addLog(newState, playerId, 'slyDeal', `Attempts to steal a property from ${getPlayer(newState, action.targetPlayerId).name}`);
      newState.actionsRemaining--;
      break;
    }

    case 'playForcedDeal': {
      const card = removeCardFromHand(player, action.cardId);
      newState.discardPile.push(card);
      newState.pendingAction = {
        type: 'forcedDeal',
        sourcePlayerId: playerId,
        targetPlayerIds: [action.targetPlayerId],
        card,
        targetCardId: action.targetCardId,
        offeredCardId: action.offeredCardId,
        respondedPlayers: [],
      };
      newState.phase = 'waitingForResponse';
      addLog(newState, playerId, 'forcedDeal', `Proposes forced trade with ${getPlayer(newState, action.targetPlayerId).name}`);
      newState.actionsRemaining--;
      break;
    }

    case 'playDealBreaker': {
      const card = removeCardFromHand(player, action.cardId);
      newState.discardPile.push(card);
      newState.pendingAction = {
        type: 'dealBreaker',
        sourcePlayerId: playerId,
        targetPlayerIds: [action.targetPlayerId],
        card,
        targetSetColor: action.targetColor,
        respondedPlayers: [],
      };
      newState.phase = 'waitingForResponse';
      const target = getPlayer(newState, action.targetPlayerId);
      addLog(newState, playerId, 'dealBreaker', `Attempts to steal ${target.name}'s ${action.targetColor} set!`);
      newState.actionsRemaining--;
      break;
    }

    case 'playHouse': {
      const card = removeCardFromHand(player, action.cardId);
      const set = player.properties.find(s => s.color === action.targetColor && isSetComplete(s));
      if (set) {
        set.house = true;
        addLog(newState, playerId, 'house', `Added House to ${action.targetColor} set`);
      }
      newState.actionsRemaining--;
      break;
    }

    case 'playHotel': {
      const card = removeCardFromHand(player, action.cardId);
      const set = player.properties.find(s => s.color === action.targetColor && isSetComplete(s) && s.house);
      if (set) {
        set.hotel = true;
        addLog(newState, playerId, 'hotel', `Added Hotel to ${action.targetColor} set`);
      }
      newState.actionsRemaining--;
      break;
    }

    case 'respondJustSayNo': {
      const card = removeCardFromHand(player, action.cardId);
      newState.discardPile.push(card);
      const pending = newState.pendingAction!;
      addLog(newState, playerId, 'justSayNo', `Just Say No!`);

      if (pending.justSayNoChain) {
        // Counter the chain - swap back
        const depth = pending.justSayNoChain.depth + 1;
        pending.justSayNoChain = {
          initiatorId: playerId,
          targetId: pending.justSayNoChain.initiatorId,
          depth,
        };
        pending.targetPlayerIds = [pending.justSayNoChain.targetId];
        pending.respondedPlayers = [];
      } else {
        // First Just Say No in the chain
        pending.justSayNoChain = {
          initiatorId: playerId,
          targetId: pending.sourcePlayerId,
          depth: 1,
        };
        pending.targetPlayerIds = [pending.sourcePlayerId];
        pending.respondedPlayers = [];
      }
      break;
    }

    case 'respondPay': {
      const pending = newState.pendingAction!;
      const sourcePlayer = getPlayer(newState, pending.sourcePlayerId);
      const amount = pending.amount || 0;

      // Collect payment cards
      let paid = 0;
      for (const cardId of action.cardIds) {
        // Try bank first
        const bankIdx = player.bank.findIndex(c => c.id === cardId);
        if (bankIdx !== -1) {
          const payCard = player.bank.splice(bankIdx, 1)[0];
          paid += getCardValue(payCard);
          sourcePlayer.bank.push(payCard);
          continue;
        }
        // Try properties
        const propResult = removeCardFromProperties(player, cardId);
        if (propResult) {
          paid += getCardValue(propResult.card);
          if (propResult.card.type === 'property' || propResult.card.type === 'wildcard') {
            addPropertyToPlayer(sourcePlayer, propResult.card as PropertyCard | WildcardCard,
              propResult.card.type === 'property' ? propResult.card.color : propResult.fromColor);
          } else {
            sourcePlayer.bank.push(propResult.card);
          }
          continue;
        }
        // Try house/hotel (simplified - pay from set improvements)
      }

      addLog(newState, playerId, 'pay', `Paid $${paid}M`);
      pending.respondedPlayers.push(playerId);

      // Check if all targets have responded
      if (pending.targetPlayerIds.every(id => pending.respondedPlayers.includes(id))) {
        newState.pendingAction = null;
        newState.phase = 'play';
      }
      break;
    }

    case 'respondAccept': {
      const pending = newState.pendingAction!;
      const sourcePlayer = getPlayer(newState, pending.sourcePlayerId);

      if (pending.justSayNoChain) {
        // The target of the Just Say No chain accepts - action resolves in favor of chain initiator
        const chainWinner = pending.justSayNoChain.initiatorId;

        if (pending.justSayNoChain.depth % 2 === 1) {
          // Odd depth = target blocked the original action
          pending.respondedPlayers.push(playerId);
          if (pending.targetPlayerIds.every(id => pending.respondedPlayers.includes(id))) {
            newState.pendingAction = null;
            newState.phase = 'play';
          }
          break;
        }
        // Even depth = source reasserted, action proceeds as normal
        // Fall through to resolve the original action
      }

      switch (pending.type) {
        case 'slyDeal': {
          const target = getPlayer(newState, pending.targetPlayerIds[0]);
          const result = removeCardFromProperties(target, pending.targetCardId!);
          if (result) {
            const card = result.card as PropertyCard | WildcardCard;
            const color = card.type === 'property' ? card.color : result.fromColor;
            addPropertyToPlayer(sourcePlayer, card, color);
            addLog(newState, pending.sourcePlayerId, 'slyDealSuccess', `Stole a property from ${target.name}`);
          }
          break;
        }
        case 'forcedDeal': {
          const target = getPlayer(newState, pending.targetPlayerIds[0]);
          const theirResult = removeCardFromProperties(target, pending.targetCardId!);
          const myResult = removeCardFromProperties(sourcePlayer, pending.offeredCardId!);
          if (theirResult && myResult) {
            const theirCard = theirResult.card as PropertyCard | WildcardCard;
            const myCard = myResult.card as PropertyCard | WildcardCard;
            const theirColor = theirCard.type === 'property' ? theirCard.color : theirResult.fromColor;
            const myColor = myCard.type === 'property' ? myCard.color : myResult.fromColor;
            addPropertyToPlayer(sourcePlayer, theirCard, theirColor);
            addPropertyToPlayer(target, myCard, myColor);
            addLog(newState, pending.sourcePlayerId, 'forcedDealSuccess', `Traded properties with ${target.name}`);
          }
          break;
        }
        case 'dealBreaker': {
          const target = getPlayer(newState, pending.targetPlayerIds[0]);
          const targetColor = pending.targetSetColor!;
          const setIdx = target.properties.findIndex(s => s.color === targetColor && isSetComplete(s));
          if (setIdx !== -1) {
            const stolenSet = target.properties.splice(setIdx, 1)[0];
            sourcePlayer.properties.push({ ...stolenSet });
            addLog(newState, pending.sourcePlayerId, 'dealBreakerSuccess',
              `Stole ${target.name}'s ${targetColor} set!`);
          }
          break;
        }
      }

      pending.respondedPlayers.push(playerId);
      if (pending.targetPlayerIds.every(id => pending.respondedPlayers.includes(id))) {
        newState.pendingAction = null;
        newState.phase = 'play';
      }
      break;
    }

    case 'rearrangeWildcard': {
      // Free action - move wildcard between sets
      const result = removeCardFromProperties(player, action.cardId);
      if (result) {
        const card = result.card as WildcardCard;
        addPropertyToPlayer(player, card, action.toColor);
      }
      // Does NOT consume an action
      break;
    }

    case 'endTurn': {
      // Move to discard phase if hand > 7
      if (player.hand.length > 7) {
        newState.phase = 'discard';
      } else {
        advanceToNextTurn(newState);
      }
      break;
    }

    case 'discard': {
      for (const cardId of action.cardIds) {
        const card = removeCardFromHand(player, cardId);
        newState.discardPile.push(card);
      }
      if (player.hand.length <= 7) {
        advanceToNextTurn(newState);
      }
      break;
    }
  }

  // Check win condition
  const winner = checkWinCondition(newState);
  if (winner) {
    newState.winner = winner;
    newState.phase = 'gameOver';
    addLog(newState, winner, 'win', `${getPlayer(newState, winner).name} wins!`);
  }

  return newState;
}

function advanceToNextTurn(state: GameState): void {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turnNumber++;
  state.actionsRemaining = 3;
  state.phase = 'draw';

  // Auto-draw for the new player
  const currentPlayer = state.players[state.currentPlayerIndex];
  const drawCount = currentPlayer.hand.length === 0 ? 5 : 2;
  const drawn = drawCards(state, drawCount);
  currentPlayer.hand.push(...drawn);
  addLog(state, currentPlayer.id, 'draw', `Drew ${drawCount} cards`);
  state.phase = 'play';
}

// Start the first turn's draw phase
export function startGame(state: GameState): GameState {
  const newState = JSON.parse(JSON.stringify(state));
  const currentPlayer = newState.players[0];
  const drawCount = currentPlayer.hand.length === 0 ? 5 : 2;
  const drawn = drawCards(newState, drawCount);
  currentPlayer.hand.push(...drawn);
  addLog(newState, currentPlayer.id, 'draw', `Drew ${drawCount} cards`);
  newState.phase = 'play';
  return newState;
}

// ============================================================
// Card description helper
// ============================================================

export function cardDescription(card: Card): string {
  switch (card.type) {
    case 'money': return `$${card.value}M`;
    case 'property': return card.name;
    case 'wildcard':
      if (card.colors === 'all') return 'Rainbow Wildcard';
      return `Wildcard (${card.colors.join('/')})`;
    case 'action': {
      const names: Record<string, string> = {
        passGo: 'Pass Go',
        debtCollector: 'Debt Collector',
        itIsMyBirthday: "It's My Birthday",
        slyDeal: 'Sly Deal',
        forcedDeal: 'Forced Deal',
        dealBreaker: 'Deal Breaker',
        justSayNo: 'Just Say No',
        house: 'House',
        hotel: 'Hotel',
        doubleTheRent: 'Double the Rent',
      };
      return names[card.action] || card.action;
    }
    case 'rent':
      if (card.colors === 'all') return 'Wild Rent';
      return `Rent (${card.colors.join('/')})`;
  }
}

// ============================================================
// Payment helpers
// ============================================================

export function getPayableCards(player: Player): { card: Card; source: 'bank' | 'property'; color?: PropertyColor }[] {
  const payable: { card: Card; source: 'bank' | 'property'; color?: PropertyColor }[] = [];

  for (const card of player.bank) {
    payable.push({ card, source: 'bank' });
  }

  for (const set of player.properties) {
    for (const card of set.cards) {
      if (card.value > 0) { // rainbow wildcards can't be used for payment
        payable.push({ card, source: 'property', color: set.color });
      }
    }
  }

  return payable;
}

export function calculatePaymentValue(player: Player, cardIds: string[]): number {
  let total = 0;
  for (const cardId of cardIds) {
    const bankCard = player.bank.find(c => c.id === cardId);
    if (bankCard) { total += getCardValue(bankCard); continue; }
    for (const set of player.properties) {
      const propCard = set.cards.find(c => c.id === cardId);
      if (propCard) { total += getCardValue(propCard); break; }
    }
  }
  return total;
}

export function canPlayerPay(player: Player): boolean {
  return player.bank.length > 0 || player.properties.some(s => s.cards.some(c => c.value > 0));
}

export function autoSelectPayment(player: Player, amount: number): string[] {
  // Greedy: pay from bank first (smallest bills), then properties
  const selected: string[] = [];
  let remaining = amount;

  // Sort bank by value ascending
  const bankSorted = [...player.bank].sort((a, b) => getCardValue(a) - getCardValue(b));
  for (const card of bankSorted) {
    if (remaining <= 0) break;
    selected.push(card.id);
    remaining -= getCardValue(card);
  }

  if (remaining > 0) {
    // Pay with properties, preferring cards not in complete sets, lowest value first
    const propCards: { card: Card; setComplete: boolean }[] = [];
    for (const set of player.properties) {
      const complete = isSetComplete(set);
      for (const card of set.cards) {
        if (card.value > 0) {
          propCards.push({ card, setComplete: complete });
        }
      }
    }
    // Prefer incomplete sets first, then lowest value
    propCards.sort((a, b) => {
      if (a.setComplete !== b.setComplete) return a.setComplete ? 1 : -1;
      return getCardValue(a.card) - getCardValue(b.card);
    });
    for (const { card } of propCards) {
      if (remaining <= 0) break;
      selected.push(card.id);
      remaining -= getCardValue(card);
    }
  }

  return selected;
}
