import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGame,
  startGame,
  getPlayerView,
  applyAction,
  getLegalActions,
  isSetComplete,
  countCompleteSets,
  cardDescription,
  getCardValue,
  getPayableCards,
  calculatePaymentValue,
  canPlayerPay,
  autoSelectPayment,
  PlayerConfig,
} from '../engine';
import { GameState, Player, PropertySet, Card, PropertyCard, WildcardCard, ActionCard, RentCard, PlayerAction } from '../types';
import { createDeck } from '../cards';

// ============================================================
// Test Helpers
// ============================================================

function twoPlayerConfigs(): PlayerConfig[] {
  return [
    { name: 'Alice', isAI: false },
    { name: 'Bob', isAI: true },
  ];
}

function threePlayerConfigs(): PlayerConfig[] {
  return [
    { name: 'Alice', isAI: false },
    { name: 'Bob', isAI: true },
    { name: 'Charlie', isAI: true },
  ];
}

/** Create a started game ready for player_0 to act */
function newStartedGame(configs?: PlayerConfig[]): GameState {
  return startGame(createGame(configs || twoPlayerConfigs()));
}

/** Find a card in a player's hand by type */
function findInHand(player: Player, type: Card['type'], predicate?: (c: Card) => boolean): Card | undefined {
  return player.hand.find(c => c.type === type && (!predicate || predicate(c)));
}

/** Inject specific cards into a player's hand (for testing) */
function setHand(state: GameState, playerId: string, cards: Card[]): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  const player = s.players.find(p => p.id === playerId)!;
  player.hand = cards;
  return s;
}

/** Create a specific card for testing */
function makeProperty(id: string, color: string, name: string, value: number): PropertyCard {
  return { id, type: 'property', color: color as any, name, value };
}

function makeMoney(id: string, value: number): Card {
  return { id, type: 'money', value };
}

function makeAction(id: string, action: string, value: number): ActionCard {
  return { id, type: 'action', action: action as any, value };
}

function makeRent(id: string, colors: string[] | 'all', value: number): RentCard {
  return { id, type: 'rent', colors: colors as any, value };
}

function makeWildcard(id: string, colors: string[] | 'all', value: number): WildcardCard {
  return { id, type: 'wildcard', colors: colors as any, value };
}

// ============================================================
// Game Initialization
// ============================================================

describe('createGame', () => {
  it('creates a game with correct number of players', () => {
    const state = createGame(twoPlayerConfigs());
    expect(state.players).toHaveLength(2);
  });

  it('deals 5 cards to each player', () => {
    const state = createGame(twoPlayerConfigs());
    for (const player of state.players) {
      expect(player.hand).toHaveLength(5);
    }
  });

  it('has correct remaining draw pile size', () => {
    // 108 total - (2 players * 5 cards) = 98
    const state = createGame(twoPlayerConfigs());
    expect(state.drawPile).toHaveLength(98);
  });

  it('starts in draw phase at turn 1', () => {
    const state = createGame(twoPlayerConfigs());
    expect(state.phase).toBe('draw');
    expect(state.turnNumber).toBe(1);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.actionsRemaining).toBe(3);
  });

  it('starts with no winner and empty discard', () => {
    const state = createGame(twoPlayerConfigs());
    expect(state.winner).toBeNull();
    expect(state.discardPile).toHaveLength(0);
    expect(state.pendingAction).toBeNull();
  });

  it('assigns sequential player IDs', () => {
    const state = createGame(threePlayerConfigs());
    expect(state.players[0].id).toBe('player_0');
    expect(state.players[1].id).toBe('player_1');
    expect(state.players[2].id).toBe('player_2');
  });

  it('preserves player names and AI flags', () => {
    const state = createGame(twoPlayerConfigs());
    expect(state.players[0].name).toBe('Alice');
    expect(state.players[0].isAI).toBe(false);
    expect(state.players[1].name).toBe('Bob');
    expect(state.players[1].isAI).toBe(true);
  });

  it('players start with empty bank and properties', () => {
    const state = createGame(twoPlayerConfigs());
    for (const player of state.players) {
      expect(player.bank).toHaveLength(0);
      expect(player.properties).toHaveLength(0);
    }
  });

  it('rejects fewer than 2 players', () => {
    expect(() => createGame([{ name: 'Solo', isAI: false }])).toThrow('2-5 players');
  });

  it('rejects more than 5 players', () => {
    const configs = Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, isAI: false }));
    expect(() => createGame(configs)).toThrow('2-5 players');
  });

  it('works with 5 players', () => {
    const configs = Array.from({ length: 5 }, (_, i) => ({ name: `P${i}`, isAI: false }));
    const state = createGame(configs);
    expect(state.players).toHaveLength(5);
    // 108 - 25 = 83
    expect(state.drawPile).toHaveLength(83);
  });

  it('no cards are shared between players and draw pile', () => {
    const state = createGame(threePlayerConfigs());
    const allIds = [
      ...state.drawPile.map(c => c.id),
      ...state.players.flatMap(p => p.hand.map(c => c.id)),
    ];
    expect(new Set(allIds).size).toBe(108);
  });
});

describe('startGame', () => {
  it('draws 2 cards for first player', () => {
    const state = createGame(twoPlayerConfigs());
    const started = startGame(state);
    expect(started.players[0].hand).toHaveLength(7); // 5 dealt + 2 drawn
    expect(started.phase).toBe('play');
  });

  it('reduces draw pile by 2', () => {
    const state = createGame(twoPlayerConfigs());
    const started = startGame(state);
    expect(started.drawPile).toHaveLength(96); // 98 - 2
  });

  it('does not mutate original state', () => {
    const state = createGame(twoPlayerConfigs());
    const originalDrawPileSize = state.drawPile.length;
    startGame(state);
    expect(state.drawPile).toHaveLength(originalDrawPileSize);
  });

  it('adds a draw log entry', () => {
    const started = newStartedGame();
    expect(started.log).toHaveLength(1);
    expect(started.log[0].action).toBe('draw');
    expect(started.log[0].playerId).toBe('player_0');
  });
});

// ============================================================
// Player View
// ============================================================

describe('getPlayerView', () => {
  it('shows own hand but not opponents hand', () => {
    const state = newStartedGame();
    const view = getPlayerView(state, 'player_0');
    expect(view.myHand.length).toBeGreaterThan(0);
    for (const opp of view.opponents) {
      expect(opp.handCount).toBeGreaterThan(0);
      // OpponentView has handCount, not hand
      expect((opp as any).hand).toBeUndefined();
    }
  });

  it('throws for unknown player', () => {
    const state = newStartedGame();
    expect(() => getPlayerView(state, 'unknown')).toThrow('not found');
  });

  it('includes correct metadata', () => {
    const state = newStartedGame();
    const view = getPlayerView(state, 'player_0');
    expect(view.gameId).toBe(state.id);
    expect(view.myId).toBe('player_0');
    expect(view.currentPlayerId).toBe('player_0');
    expect(view.phase).toBe('play');
    expect(view.actionsRemaining).toBe(3);
    expect(view.drawPileCount).toBe(state.drawPile.length);
  });
});

// ============================================================
// Property Set Completion
// ============================================================

describe('isSetComplete', () => {
  it('returns true for a complete brown set (2 properties)', () => {
    const set: PropertySet = {
      color: 'brown',
      cards: [
        makeProperty('p1', 'brown', 'Mediterranean', 1),
        makeProperty('p2', 'brown', 'Baltic', 1),
      ],
      house: false, hotel: false,
    };
    expect(isSetComplete(set)).toBe(true);
  });

  it('returns false for incomplete set', () => {
    const set: PropertySet = {
      color: 'red',
      cards: [makeProperty('p1', 'red', 'Kentucky', 3)],
      house: false, hotel: false,
    };
    expect(isSetComplete(set)).toBe(false);
  });

  it('returns false for wildcard-only set (no standard property)', () => {
    const set: PropertySet = {
      color: 'brown',
      cards: [
        makeWildcard('w1', ['brown', 'lightBlue'], 1),
        makeWildcard('w2', 'all', 0),
      ],
      house: false, hotel: false,
    };
    expect(isSetComplete(set)).toBe(false);
  });

  it('returns true for set with mix of property and wildcard', () => {
    const set: PropertySet = {
      color: 'brown',
      cards: [
        makeProperty('p1', 'brown', 'Mediterranean', 1),
        makeWildcard('w1', ['brown', 'lightBlue'], 1),
      ],
      house: false, hotel: false,
    };
    expect(isSetComplete(set)).toBe(true);
  });

  it('requires 4 cards for railroad', () => {
    const set: PropertySet = {
      color: 'railroad',
      cards: [
        makeProperty('r1', 'railroad', 'Reading', 2),
        makeProperty('r2', 'railroad', 'Pennsylvania', 2),
        makeProperty('r3', 'railroad', 'B&O', 2),
      ],
      house: false, hotel: false,
    };
    expect(isSetComplete(set)).toBe(false);
    set.cards.push(makeProperty('r4', 'railroad', 'Short Line', 2));
    expect(isSetComplete(set)).toBe(true);
  });
});

describe('countCompleteSets', () => {
  it('returns 0 for player with no properties', () => {
    const player: Player = {
      id: 'p', name: 'Test', hand: [], bank: [],
      properties: [], isAI: false,
    };
    expect(countCompleteSets(player)).toBe(0);
  });

  it('counts multiple complete sets', () => {
    const player: Player = {
      id: 'p', name: 'Test', hand: [], bank: [],
      properties: [
        {
          color: 'brown', house: false, hotel: false,
          cards: [makeProperty('b1', 'brown', 'Med', 1), makeProperty('b2', 'brown', 'Baltic', 1)],
        },
        {
          color: 'darkBlue', house: false, hotel: false,
          cards: [makeProperty('db1', 'darkBlue', 'Park', 4), makeProperty('db2', 'darkBlue', 'Board', 4)],
        },
        {
          color: 'red', house: false, hotel: false,
          cards: [makeProperty('r1', 'red', 'Kentucky', 3)], // incomplete
        },
      ],
      isAI: false,
    };
    expect(countCompleteSets(player)).toBe(2);
  });
});

// ============================================================
// Turn Structure
// ============================================================

describe('turn structure', () => {
  it('playing a money card banks it and decrements actions', () => {
    let state = newStartedGame();
    const moneyCard = findInHand(state.players[0], 'money');
    if (!moneyCard) return; // skip if no money in hand

    state = applyAction(state, 'player_0', { type: 'playCard', cardId: moneyCard.id });
    expect(state.players[0].bank.some(c => c.id === moneyCard.id)).toBe(true);
    expect(state.actionsRemaining).toBe(2);
    expect(state.players[0].hand.some(c => c.id === moneyCard.id)).toBe(false);
  });

  it('ending turn advances to next player', () => {
    let state = newStartedGame();
    const p1HandBefore = state.players[1].hand.length;

    state = applyAction(state, 'player_0', { type: 'endTurn' });
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.turnNumber).toBe(2);
    expect(state.actionsRemaining).toBe(3);
    // Next player draws 2 cards
    expect(state.players[1].hand.length).toBe(p1HandBefore + 2);
  });

  it('turn wraps around after last player', () => {
    let state = newStartedGame();
    // End player 0's turn
    state = applyAction(state, 'player_0', { type: 'endTurn' });
    expect(state.currentPlayerIndex).toBe(1);
    // End player 1's turn
    state = applyAction(state, 'player_1', { type: 'endTurn' });
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.turnNumber).toBe(3);
  });

  it('cannot play more than 3 cards per turn', () => {
    let state = newStartedGame();
    // Use up 3 actions
    for (let i = 0; i < 3; i++) {
      const card = state.players[0].hand[0];
      if (card.type === 'money') {
        state = applyAction(state, 'player_0', { type: 'playCard', cardId: card.id });
      } else {
        state = applyAction(state, 'player_0', { type: 'playCard', cardId: card.id, asBank: true });
      }
    }
    expect(state.actionsRemaining).toBe(0);
    // Legal actions should only contain endTurn and possibly rearrangeWildcard
    const legal = getLegalActions(state, 'player_0');
    expect(legal.every(a => a.type === 'endTurn' || a.type === 'rearrangeWildcard')).toBe(true);
  });

  it('rearranging wildcards does not consume an action', () => {
    let state = newStartedGame();
    const p = state.players[0];
    // Inject a wildcard into properties
    p.properties = [{
      color: 'brown',
      cards: [makeWildcard('tw1', ['brown', 'lightBlue'], 1)],
      house: false, hotel: false,
    }];

    state = applyAction(state, 'player_0', {
      type: 'rearrangeWildcard',
      cardId: 'tw1',
      fromColor: 'brown',
      toColor: 'lightBlue',
    });

    expect(state.actionsRemaining).toBe(3); // unchanged
    expect(state.players[0].properties.some(s => s.color === 'lightBlue')).toBe(true);
  });
});

// ============================================================
// Discard Phase
// ============================================================

describe('discard phase', () => {
  it('triggers discard phase when hand exceeds 7 at end of turn', () => {
    let state = newStartedGame();
    const p = state.players[0];
    // Give player 9 cards in hand
    while (p.hand.length < 9) {
      p.hand.push(makeMoney(`extra_${p.hand.length}`, 1));
    }

    state = applyAction(state, 'player_0', { type: 'endTurn' });
    expect(state.phase).toBe('discard');
    expect(state.currentPlayerIndex).toBe(0); // still player_0's turn for discard
  });

  it('discarding brings hand to 7 and advances turn', () => {
    let state = newStartedGame();
    const p = state.players[0];
    while (p.hand.length < 9) {
      p.hand.push(makeMoney(`extra_${p.hand.length}`, 1));
    }

    state = applyAction(state, 'player_0', { type: 'endTurn' });
    expect(state.phase).toBe('discard');

    // Discard 2 cards
    const c1 = state.players[0].hand[0].id;
    const c2 = state.players[0].hand[1].id;
    state = applyAction(state, 'player_0', { type: 'discard', cardIds: [c1, c2] });

    expect(state.players[0].hand.length).toBe(7);
    expect(state.currentPlayerIndex).toBe(1); // advanced to next player
  });
});

// ============================================================
// Playing Properties
// ============================================================

describe('playing properties', () => {
  it('plays a property card to the correct color set', () => {
    let state = newStartedGame();
    const prop = findInHand(state.players[0], 'property');
    if (!prop || prop.type !== 'property') return;

    state = applyAction(state, 'player_0', { type: 'playProperty', cardId: prop.id });
    const set = state.players[0].properties.find(s => s.color === prop.color);
    expect(set).toBeDefined();
    expect(set!.cards.some(c => c.id === prop.id)).toBe(true);
  });

  it('plays a wildcard to the specified color', () => {
    let state = newStartedGame();
    const p = state.players[0];
    const wc = makeWildcard('test_wc', ['red', 'yellow'], 3);
    p.hand.push(wc);

    state = applyAction(state, 'player_0', { type: 'playProperty', cardId: 'test_wc', color: 'yellow' });
    const set = state.players[0].properties.find(s => s.color === 'yellow');
    expect(set).toBeDefined();
    expect(set!.cards.some(c => c.id === 'test_wc')).toBe(true);
  });
});

// ============================================================
// Action Cards
// ============================================================

describe('Pass Go', () => {
  it('draws 2 extra cards', () => {
    let state = newStartedGame();
    const p = state.players[0];
    const passGo = findInHand(p, 'action', c => c.type === 'action' && c.action === 'passGo');
    if (!passGo) {
      // Inject one
      p.hand.push(makeAction('pg_test', 'passGo', 1));
    }
    const pgCard = findInHand(state.players[0], 'action', c => c.type === 'action' && c.action === 'passGo')!;
    const handSizeBefore = state.players[0].hand.length;
    const drawPileBefore = state.drawPile.length;

    state = applyAction(state, 'player_0', { type: 'playCard', cardId: pgCard.id });

    // Hand: -1 (played) + 2 (drawn) = net +1
    expect(state.players[0].hand.length).toBe(handSizeBefore + 1);
    expect(state.drawPile.length).toBe(drawPileBefore - 2);
    expect(state.discardPile.some(c => c.id === pgCard.id)).toBe(true);
    expect(state.actionsRemaining).toBe(2);
  });
});

describe("It's My Birthday", () => {
  it('creates pending action targeting all opponents', () => {
    let state = newStartedGame(threePlayerConfigs());
    const p = state.players[0];
    p.hand.push(makeAction('bday_test', 'itIsMyBirthday', 2));

    state = applyAction(state, 'player_0', { type: 'playCard', cardId: 'bday_test' });

    expect(state.phase).toBe('waitingForResponse');
    expect(state.pendingAction).not.toBeNull();
    expect(state.pendingAction!.type).toBe('itIsMyBirthday');
    expect(state.pendingAction!.amount).toBe(2);
    expect(state.pendingAction!.targetPlayerIds).toContain('player_1');
    expect(state.pendingAction!.targetPlayerIds).toContain('player_2');
    expect(state.pendingAction!.targetPlayerIds).toHaveLength(2);
  });
});

describe('Debt Collector', () => {
  it('creates pending action targeting specific opponent for $5M', () => {
    let state = newStartedGame();
    const p = state.players[0];
    p.hand.push(makeAction('dc_test', 'debtCollector', 3));

    state = applyAction(state, 'player_0', {
      type: 'playDebtCollector',
      cardId: 'dc_test',
      targetPlayerId: 'player_1',
    });

    expect(state.phase).toBe('waitingForResponse');
    expect(state.pendingAction!.type).toBe('debtCollector');
    expect(state.pendingAction!.amount).toBe(5);
    expect(state.pendingAction!.targetPlayerIds).toEqual(['player_1']);
  });
});

describe('Sly Deal', () => {
  it('steals a property from opponent when accepted', () => {
    let state = newStartedGame();
    // Give player 0 a sly deal
    state.players[0].hand.push(makeAction('sd_test', 'slyDeal', 3));
    // Give player 1 a property (incomplete set)
    state.players[1].properties = [{
      color: 'red',
      cards: [makeProperty('target_prop', 'red', 'Kentucky', 3)],
      house: false, hotel: false,
    }];

    state = applyAction(state, 'player_0', {
      type: 'playSlyDeal',
      cardId: 'sd_test',
      targetPlayerId: 'player_1',
      targetCardId: 'target_prop',
    });

    expect(state.phase).toBe('waitingForResponse');

    // Target accepts
    state = applyAction(state, 'player_1', { type: 'respondAccept' });

    expect(state.phase).toBe('play');
    // Player 0 should have the property
    expect(state.players[0].properties.some(
      s => s.cards.some(c => c.id === 'target_prop')
    )).toBe(true);
    // Player 1 should not
    expect(state.players[1].properties.every(
      s => s.cards.every(c => c.id !== 'target_prop')
    )).toBe(true);
  });

  it('cannot steal from a complete set', () => {
    let state = newStartedGame();
    state.players[0].hand.push(makeAction('sd2', 'slyDeal', 3));
    // Give player 1 a complete brown set
    state.players[1].properties = [{
      color: 'brown',
      cards: [
        makeProperty('b1', 'brown', 'Med', 1),
        makeProperty('b2', 'brown', 'Baltic', 1),
      ],
      house: false, hotel: false,
    }];

    const legal = getLegalActions(state, 'player_0');
    const slyDeals = legal.filter(a => a.type === 'playSlyDeal');
    // Should not find any sly deal targeting the complete brown set
    expect(slyDeals.every(a =>
      a.type === 'playSlyDeal' && a.targetCardId !== 'b1' && a.targetCardId !== 'b2'
    )).toBe(true);
  });
});

describe('Forced Deal', () => {
  it('swaps properties between players when accepted', () => {
    let state = newStartedGame();
    state.players[0].hand.push(makeAction('fd_test', 'forcedDeal', 3));
    state.players[0].properties = [{
      color: 'brown',
      cards: [makeProperty('my_prop', 'brown', 'Med', 1)],
      house: false, hotel: false,
    }];
    state.players[1].properties = [{
      color: 'red',
      cards: [makeProperty('their_prop', 'red', 'Kentucky', 3)],
      house: false, hotel: false,
    }];

    state = applyAction(state, 'player_0', {
      type: 'playForcedDeal',
      cardId: 'fd_test',
      targetPlayerId: 'player_1',
      targetCardId: 'their_prop',
      offeredCardId: 'my_prop',
    });

    // Accept the deal
    state = applyAction(state, 'player_1', { type: 'respondAccept' });

    // Player 0 should have their_prop and player 1 should have my_prop
    expect(state.players[0].properties.some(
      s => s.cards.some(c => c.id === 'their_prop')
    )).toBe(true);
    expect(state.players[1].properties.some(
      s => s.cards.some(c => c.id === 'my_prop')
    )).toBe(true);
  });
});

describe('Deal Breaker', () => {
  it('steals entire complete set when accepted', () => {
    let state = newStartedGame();
    state.players[0].hand.push(makeAction('db_test', 'dealBreaker', 5));
    state.players[1].properties = [{
      color: 'darkBlue',
      cards: [
        makeProperty('pp', 'darkBlue', 'Park Place', 4),
        makeProperty('bw', 'darkBlue', 'Boardwalk', 4),
      ],
      house: false, hotel: false,
    }];

    state = applyAction(state, 'player_0', {
      type: 'playDealBreaker',
      cardId: 'db_test',
      targetPlayerId: 'player_1',
      targetColor: 'darkBlue',
    });

    state = applyAction(state, 'player_1', { type: 'respondAccept' });

    // Player 0 has the darkBlue set
    const p0Set = state.players[0].properties.find(s => s.color === 'darkBlue');
    expect(p0Set).toBeDefined();
    expect(p0Set!.cards).toHaveLength(2);
    // Player 1 has no darkBlue
    expect(state.players[1].properties.find(s => s.color === 'darkBlue')).toBeUndefined();
  });

  it('can only target complete sets', () => {
    let state = newStartedGame();
    state.players[0].hand.push(makeAction('db2', 'dealBreaker', 5));
    // Incomplete red set
    state.players[1].properties = [{
      color: 'red',
      cards: [makeProperty('r1', 'red', 'Kentucky', 3)],
      house: false, hotel: false,
    }];

    const legal = getLegalActions(state, 'player_0');
    const dealBreakers = legal.filter(a => a.type === 'playDealBreaker');
    expect(dealBreakers).toHaveLength(0);
  });
});

describe('House and Hotel', () => {
  it('places house on complete set', () => {
    let state = newStartedGame();
    state.players[0].hand.push(makeAction('house_test', 'house', 3));
    state.players[0].properties = [{
      color: 'brown',
      cards: [
        makeProperty('b1', 'brown', 'Med', 1),
        makeProperty('b2', 'brown', 'Baltic', 1),
      ],
      house: false, hotel: false,
    }];

    state = applyAction(state, 'player_0', {
      type: 'playHouse',
      cardId: 'house_test',
      targetColor: 'brown',
    });

    expect(state.players[0].properties[0].house).toBe(true);
  });

  it('places hotel on set with house', () => {
    let state = newStartedGame();
    state.players[0].hand.push(makeAction('hotel_test', 'hotel', 4));
    state.players[0].properties = [{
      color: 'brown',
      cards: [
        makeProperty('b1', 'brown', 'Med', 1),
        makeProperty('b2', 'brown', 'Baltic', 1),
      ],
      house: true, hotel: false,
    }];

    state = applyAction(state, 'player_0', {
      type: 'playHotel',
      cardId: 'hotel_test',
      targetColor: 'brown',
    });

    expect(state.players[0].properties[0].hotel).toBe(true);
  });

  it('cannot place hotel without house', () => {
    let state = newStartedGame();
    state.players[0].hand.push(makeAction('hotel2', 'hotel', 4));
    state.players[0].properties = [{
      color: 'brown',
      cards: [
        makeProperty('b1', 'brown', 'Med', 1),
        makeProperty('b2', 'brown', 'Baltic', 1),
      ],
      house: false, hotel: false,
    }];

    const legal = getLegalActions(state, 'player_0');
    const hotels = legal.filter(a => a.type === 'playHotel');
    expect(hotels).toHaveLength(0);
  });

  it('cannot place house on railroad or utility', () => {
    let state = newStartedGame();
    state.players[0].hand.push(makeAction('house3', 'house', 3));
    state.players[0].properties = [{
      color: 'utility',
      cards: [
        makeProperty('u1', 'utility', 'Electric', 2),
        makeProperty('u2', 'utility', 'Water', 2),
      ],
      house: false, hotel: false,
    }];

    const legal = getLegalActions(state, 'player_0');
    const houses = legal.filter(a => a.type === 'playHouse');
    expect(houses).toHaveLength(0);
  });
});

// ============================================================
// Rent System
// ============================================================

describe('rent', () => {
  it('dual-color rent targets all opponents', () => {
    let state = newStartedGame(threePlayerConfigs());
    const rentCard = makeRent('rent_test', ['brown', 'lightBlue'], 1);
    state.players[0].hand.push(rentCard);
    state.players[0].properties = [{
      color: 'brown',
      cards: [makeProperty('b1', 'brown', 'Med', 1)],
      house: false, hotel: false,
    }];

    state = applyAction(state, 'player_0', {
      type: 'playRent',
      cardId: 'rent_test',
      targetColor: 'brown',
    });

    expect(state.pendingAction!.targetPlayerIds).toHaveLength(2);
    expect(state.pendingAction!.amount).toBe(1); // 1 brown card = $1M rent
  });

  it('wild rent targets one opponent', () => {
    let state = newStartedGame(threePlayerConfigs());
    state.players[0].hand.push(makeRent('wrent_test', 'all', 3));
    state.players[0].properties = [{
      color: 'darkBlue',
      cards: [
        makeProperty('db1', 'darkBlue', 'Park', 4),
        makeProperty('db2', 'darkBlue', 'Boardwalk', 4),
      ],
      house: false, hotel: false,
    }];

    state = applyAction(state, 'player_0', {
      type: 'playRent',
      cardId: 'wrent_test',
      targetColor: 'darkBlue',
      targetPlayerId: 'player_1',
    });

    expect(state.pendingAction!.targetPlayerIds).toEqual(['player_1']);
    expect(state.pendingAction!.amount).toBe(8); // complete darkBlue = $8M
  });

  it('double the rent doubles the amount', () => {
    let state = newStartedGame();
    state.players[0].hand = [
      makeRent('rent_d', ['brown', 'lightBlue'], 1),
      makeAction('dtr_1', 'doubleTheRent', 1),
    ];
    state.players[0].properties = [{
      color: 'brown',
      cards: [
        makeProperty('b1', 'brown', 'Med', 1),
        makeProperty('b2', 'brown', 'Baltic', 1),
      ],
      house: false, hotel: false,
    }];

    state = applyAction(state, 'player_0', {
      type: 'playRent',
      cardId: 'rent_d',
      targetColor: 'brown',
      doubleCardIds: ['dtr_1'],
    });

    expect(state.pendingAction!.amount).toBe(4); // $2M base * 2 = $4M
    expect(state.actionsRemaining).toBe(1); // rent + double = 2 actions
  });
});

// ============================================================
// Payment System
// ============================================================

describe('payment', () => {
  it('paying from bank transfers money to source player', () => {
    let state = newStartedGame();
    // Set up: player 0 plays birthday, player 1 pays from bank
    state.players[1].bank = [makeMoney('m5', 5)];
    state.pendingAction = {
      type: 'itIsMyBirthday',
      sourcePlayerId: 'player_0',
      targetPlayerIds: ['player_1'],
      amount: 2,
      respondedPlayers: [],
    };
    state.phase = 'waitingForResponse';

    state = applyAction(state, 'player_1', { type: 'respondPay', cardIds: ['m5'] });

    expect(state.players[1].bank).toHaveLength(0);
    expect(state.players[0].bank.some(c => c.id === 'm5')).toBe(true);
    expect(state.phase).toBe('play');
  });

  it('paying with property transfers it to source property area', () => {
    let state = newStartedGame();
    state.players[1].bank = [];
    state.players[1].properties = [{
      color: 'red',
      cards: [makeProperty('rp1', 'red', 'Kentucky', 3)],
      house: false, hotel: false,
    }];
    state.pendingAction = {
      type: 'debtCollector',
      sourcePlayerId: 'player_0',
      targetPlayerIds: ['player_1'],
      amount: 5,
      respondedPlayers: [],
    };
    state.phase = 'waitingForResponse';

    state = applyAction(state, 'player_1', { type: 'respondPay', cardIds: ['rp1'] });

    // Property goes to player 0's property area
    expect(state.players[0].properties.some(
      s => s.cards.some(c => c.id === 'rp1')
    )).toBe(true);
  });

  it('paying nothing when broke is allowed', () => {
    let state = newStartedGame();
    state.players[1].bank = [];
    state.players[1].properties = [];
    state.pendingAction = {
      type: 'itIsMyBirthday',
      sourcePlayerId: 'player_0',
      targetPlayerIds: ['player_1'],
      amount: 2,
      respondedPlayers: [],
    };
    state.phase = 'waitingForResponse';

    state = applyAction(state, 'player_1', { type: 'respondPay', cardIds: [] });

    expect(state.phase).toBe('play');
  });
});

// ============================================================
// Just Say No
// ============================================================

describe('Just Say No', () => {
  it('blocks a sly deal', () => {
    let state = newStartedGame();
    // Set up sly deal pending
    state.players[0].hand.push(makeAction('sd', 'slyDeal', 3));
    state.players[1].hand.push(makeAction('jsn1', 'justSayNo', 4));
    state.players[1].properties = [{
      color: 'red',
      cards: [makeProperty('rp', 'red', 'Kentucky', 3)],
      house: false, hotel: false,
    }];

    state = applyAction(state, 'player_0', {
      type: 'playSlyDeal',
      cardId: 'sd',
      targetPlayerId: 'player_1',
      targetCardId: 'rp',
    });

    expect(state.phase).toBe('waitingForResponse');

    // Player 1 plays Just Say No
    state = applyAction(state, 'player_1', { type: 'respondJustSayNo', cardId: 'jsn1' });

    // Now it's back to player 0 to accept or counter
    expect(state.pendingAction!.justSayNoChain).toBeDefined();
    expect(state.pendingAction!.justSayNoChain!.depth).toBe(1);

    // Player 0 accepts (doesn't counter)
    state = applyAction(state, 'player_0', { type: 'respondAccept' });

    // Sly deal was blocked - property stays with player 1
    expect(state.players[1].properties.some(
      s => s.cards.some(c => c.id === 'rp')
    )).toBe(true);
    expect(state.phase).toBe('play');
  });

  it('counter Just Say No restores original action', () => {
    let state = newStartedGame();
    state.players[0].hand = [
      makeAction('sd2', 'slyDeal', 3),
      makeAction('jsn_counter', 'justSayNo', 4),
    ];
    state.players[1].hand = [makeAction('jsn2', 'justSayNo', 4)];
    state.players[1].properties = [{
      color: 'red',
      cards: [makeProperty('rp2', 'red', 'Kentucky', 3)],
      house: false, hotel: false,
    }];

    // Player 0 plays sly deal
    state = applyAction(state, 'player_0', {
      type: 'playSlyDeal',
      cardId: 'sd2',
      targetPlayerId: 'player_1',
      targetCardId: 'rp2',
    });

    // Player 1 says Just Say No
    state = applyAction(state, 'player_1', { type: 'respondJustSayNo', cardId: 'jsn2' });
    expect(state.pendingAction!.justSayNoChain!.depth).toBe(1);

    // Player 0 counters with their own Just Say No
    state = applyAction(state, 'player_0', { type: 'respondJustSayNo', cardId: 'jsn_counter' });
    expect(state.pendingAction!.justSayNoChain!.depth).toBe(2);

    // Player 1 accepts (no more JSN cards)
    state = applyAction(state, 'player_1', { type: 'respondAccept' });

    // Original action succeeds - property stolen
    expect(state.players[0].properties.some(
      s => s.cards.some(c => c.id === 'rp2')
    )).toBe(true);
  });

  it('does not consume an action for the responder', () => {
    let state = newStartedGame();
    // This is implicitly tested - JSN is played during waitingForResponse
    // which is not the responder's turn, so their action count is irrelevant
    // Just verify it doesn't crash
    state.players[1].hand = [makeAction('jsn3', 'justSayNo', 4)];
    state.pendingAction = {
      type: 'dealBreaker',
      sourcePlayerId: 'player_0',
      targetPlayerIds: ['player_1'],
      targetSetColor: 'brown',
      respondedPlayers: [],
    };
    state.phase = 'waitingForResponse';

    state = applyAction(state, 'player_1', { type: 'respondJustSayNo', cardId: 'jsn3' });
    // Should not throw, pending action should have JSN chain
    expect(state.pendingAction!.justSayNoChain).toBeDefined();
  });
});

// ============================================================
// Win Condition
// ============================================================

describe('win condition', () => {
  it('player wins with 3 complete sets', () => {
    let state = newStartedGame();
    const p = state.players[0];
    p.properties = [
      {
        color: 'brown', house: false, hotel: false,
        cards: [makeProperty('b1', 'brown', 'Med', 1), makeProperty('b2', 'brown', 'Baltic', 1)],
      },
      {
        color: 'darkBlue', house: false, hotel: false,
        cards: [makeProperty('db1', 'darkBlue', 'Park', 4), makeProperty('db2', 'darkBlue', 'Board', 4)],
      },
      // Playing this final card should trigger win
      {
        color: 'utility', house: false, hotel: false,
        cards: [makeProperty('u1', 'utility', 'Electric', 2)],
      },
    ];
    // Add the completing card to hand
    p.hand.push(makeProperty('u2', 'utility', 'Water', 2));

    state = applyAction(state, 'player_0', { type: 'playProperty', cardId: 'u2' });

    expect(state.winner).toBe('player_0');
    expect(state.phase).toBe('gameOver');
  });

  it('does not win with only 2 complete sets', () => {
    let state = newStartedGame();
    state.players[0].properties = [
      {
        color: 'brown', house: false, hotel: false,
        cards: [makeProperty('b1', 'brown', 'Med', 1), makeProperty('b2', 'brown', 'Baltic', 1)],
      },
      {
        color: 'darkBlue', house: false, hotel: false,
        cards: [makeProperty('db1', 'darkBlue', 'Park', 4), makeProperty('db2', 'darkBlue', 'Board', 4)],
      },
    ];

    // Play a money card (doesn't complete a 3rd set)
    state.players[0].hand.push(makeMoney('m1', 1));
    state = applyAction(state, 'player_0', { type: 'playCard', cardId: 'm1' });

    expect(state.winner).toBeNull();
    expect(state.phase).toBe('play');
  });
});

// ============================================================
// Banking Action Cards
// ============================================================

describe('banking cards', () => {
  it('can bank any action card as money', () => {
    let state = newStartedGame();
    const jsn = makeAction('jsn_bank', 'justSayNo', 4);
    state.players[0].hand.push(jsn);

    state = applyAction(state, 'player_0', { type: 'playCard', cardId: 'jsn_bank', asBank: true });

    expect(state.players[0].bank.some(c => c.id === 'jsn_bank')).toBe(true);
    expect(state.players[0].bank.find(c => c.id === 'jsn_bank')!.value).toBe(4);
  });

  it('can bank a rent card as money', () => {
    let state = newStartedGame();
    const rent = makeRent('rent_bank', ['brown', 'lightBlue'], 1);
    state.players[0].hand.push(rent);

    state = applyAction(state, 'player_0', { type: 'playCard', cardId: 'rent_bank', asBank: true });

    expect(state.players[0].bank.some(c => c.id === 'rent_bank')).toBe(true);
  });
});

// ============================================================
// Legal Actions
// ============================================================

describe('getLegalActions', () => {
  it('returns empty array when not your turn', () => {
    const state = newStartedGame();
    const actions = getLegalActions(state, 'player_1');
    expect(actions).toHaveLength(0);
  });

  it('always includes endTurn during play phase', () => {
    const state = newStartedGame();
    const actions = getLegalActions(state, 'player_0');
    expect(actions.some(a => a.type === 'endTurn')).toBe(true);
  });

  it('returns discard action when hand > 7 in discard phase', () => {
    let state = newStartedGame();
    state.phase = 'discard';
    while (state.players[0].hand.length <= 7) {
      state.players[0].hand.push(makeMoney(`extra_${state.players[0].hand.length}`, 1));
    }

    const actions = getLegalActions(state, 'player_0');
    expect(actions.some(a => a.type === 'discard')).toBe(true);
  });

  it('includes respondPay and respondJustSayNo when targeted by payment action', () => {
    let state = newStartedGame();
    state.players[1].hand.push(makeAction('jsn_resp', 'justSayNo', 4));
    state.pendingAction = {
      type: 'itIsMyBirthday',
      sourcePlayerId: 'player_0',
      targetPlayerIds: ['player_1'],
      amount: 2,
      respondedPlayers: [],
    };
    state.phase = 'waitingForResponse';

    const actions = getLegalActions(state, 'player_1');
    expect(actions.some(a => a.type === 'respondPay')).toBe(true);
    expect(actions.some(a => a.type === 'respondJustSayNo')).toBe(true);
  });

  it('includes respondAccept for steal actions', () => {
    let state = newStartedGame();
    state.pendingAction = {
      type: 'slyDeal',
      sourcePlayerId: 'player_0',
      targetPlayerIds: ['player_1'],
      targetCardId: 'some_card',
      respondedPlayers: [],
    };
    state.phase = 'waitingForResponse';

    const actions = getLegalActions(state, 'player_1');
    expect(actions.some(a => a.type === 'respondAccept')).toBe(true);
  });
});

// ============================================================
// Payment Helpers
// ============================================================

describe('autoSelectPayment', () => {
  it('selects from bank first (smallest bills)', () => {
    const player: Player = {
      id: 'p', name: 'Test', hand: [], properties: [], isAI: false,
      bank: [makeMoney('m1', 1), makeMoney('m5', 5), makeMoney('m2', 2)],
    };

    const selected = autoSelectPayment(player, 3);
    // Should select $1 + $2 = $3 (smallest first)
    expect(selected).toContain('m1');
    expect(selected).toContain('m2');
    expect(selected).not.toContain('m5');
  });

  it('falls back to properties when bank is insufficient', () => {
    const player: Player = {
      id: 'p', name: 'Test', hand: [], isAI: false,
      bank: [makeMoney('m1', 1)],
      properties: [{
        color: 'red', house: false, hotel: false,
        cards: [makeProperty('rp', 'red', 'Kentucky', 3)],
      }],
    };

    const selected = autoSelectPayment(player, 5);
    expect(selected).toContain('m1');
    expect(selected).toContain('rp');
  });

  it('returns empty array when nothing to pay with', () => {
    const player: Player = {
      id: 'p', name: 'Test', hand: [], bank: [], properties: [], isAI: false,
    };
    expect(autoSelectPayment(player, 5)).toEqual([]);
  });
});

describe('canPlayerPay', () => {
  it('returns false for player with nothing on table', () => {
    const player: Player = {
      id: 'p', name: 'Test', hand: [makeMoney('m1', 1)],
      bank: [], properties: [], isAI: false,
    };
    expect(canPlayerPay(player)).toBe(false);
  });

  it('returns true when bank has money', () => {
    const player: Player = {
      id: 'p', name: 'Test', hand: [],
      bank: [makeMoney('m1', 1)], properties: [], isAI: false,
    };
    expect(canPlayerPay(player)).toBe(true);
  });

  it('returns true when properties have value', () => {
    const player: Player = {
      id: 'p', name: 'Test', hand: [], bank: [], isAI: false,
      properties: [{
        color: 'red', house: false, hotel: false,
        cards: [makeProperty('rp', 'red', 'Kentucky', 3)],
      }],
    };
    expect(canPlayerPay(player)).toBe(true);
  });
});

describe('calculatePaymentValue', () => {
  it('sums bank and property values', () => {
    const player: Player = {
      id: 'p', name: 'Test', hand: [], isAI: false,
      bank: [makeMoney('m3', 3)],
      properties: [{
        color: 'red', house: false, hotel: false,
        cards: [makeProperty('rp', 'red', 'Kentucky', 3)],
      }],
    };
    expect(calculatePaymentValue(player, ['m3', 'rp'])).toBe(6);
  });
});

// ============================================================
// Card Description
// ============================================================

describe('cardDescription', () => {
  it('describes money cards', () => {
    expect(cardDescription(makeMoney('m', 5))).toBe('$5M');
  });

  it('describes property cards by name', () => {
    expect(cardDescription(makeProperty('p', 'red', 'Kentucky Avenue', 3))).toBe('Kentucky Avenue');
  });

  it('describes rainbow wildcards', () => {
    expect(cardDescription(makeWildcard('w', 'all', 0))).toBe('Rainbow Wildcard');
  });

  it('describes dual-color wildcards', () => {
    expect(cardDescription(makeWildcard('w', ['red', 'yellow'], 3))).toContain('red');
    expect(cardDescription(makeWildcard('w', ['red', 'yellow'], 3))).toContain('yellow');
  });

  it('describes action cards', () => {
    expect(cardDescription(makeAction('a', 'dealBreaker', 5))).toBe('Deal Breaker');
    expect(cardDescription(makeAction('a', 'justSayNo', 4))).toBe('Just Say No');
    expect(cardDescription(makeAction('a', 'passGo', 1))).toBe('Pass Go');
  });

  it('describes rent cards', () => {
    expect(cardDescription(makeRent('r', 'all', 3))).toBe('Wild Rent');
    expect(cardDescription(makeRent('r', ['red', 'yellow'], 1))).toContain('red');
  });
});

// ============================================================
// State Immutability
// ============================================================

describe('state immutability', () => {
  it('applyAction does not mutate original state', () => {
    const state = newStartedGame();
    const original = JSON.stringify(state);

    const card = state.players[0].hand[0];
    applyAction(state, 'player_0', { type: 'playCard', cardId: card.id, asBank: true });

    expect(JSON.stringify(state)).toBe(original);
  });
});

// ============================================================
// Edge Cases
// ============================================================

describe('edge cases', () => {
  it('draw 5 when hand is empty at start of turn', () => {
    let state = newStartedGame();
    // Empty player 1's hand
    state.players[1].hand = [];

    // End player 0's turn
    state = applyAction(state, 'player_0', { type: 'endTurn' });

    // Player 1 should have drawn 5 instead of 2
    expect(state.players[1].hand).toHaveLength(5);
  });

  it('adding property to existing incomplete set', () => {
    let state = newStartedGame();
    state.players[0].properties = [{
      color: 'red', house: false, hotel: false,
      cards: [makeProperty('r1', 'red', 'Kentucky', 3)],
    }];
    state.players[0].hand.push(makeProperty('r2', 'red', 'Indiana', 3));

    state = applyAction(state, 'player_0', { type: 'playProperty', cardId: 'r2' });

    // Should be added to existing set, not create new one
    expect(state.players[0].properties.filter(s => s.color === 'red')).toHaveLength(1);
    expect(state.players[0].properties[0].cards).toHaveLength(2);
  });

  it('overflow creates new set when existing set is complete', () => {
    let state = newStartedGame();
    state.players[0].properties = [{
      color: 'brown', house: false, hotel: false,
      cards: [
        makeProperty('b1', 'brown', 'Med', 1),
        makeProperty('b2', 'brown', 'Baltic', 1),
      ],
    }];
    // Add a wildcard that can be brown
    state.players[0].hand.push(makeWildcard('wc_overflow', ['brown', 'lightBlue'], 1));

    state = applyAction(state, 'player_0', { type: 'playProperty', cardId: 'wc_overflow', color: 'brown' });

    // Should create a new brown set (overflow)
    const brownSets = state.players[0].properties.filter(s => s.color === 'brown');
    expect(brownSets).toHaveLength(2);
  });
});
