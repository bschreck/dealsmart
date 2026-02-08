// ============================================================
// Monopoly Deal - Core Type Definitions
// ============================================================

export type PropertyColor =
  | 'brown'
  | 'lightBlue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'darkBlue'
  | 'railroad'
  | 'utility';

export type CardType = 'money' | 'property' | 'wildcard' | 'action' | 'rent';

export type ActionType =
  | 'passGo'
  | 'debtCollector'
  | 'itIsMyBirthday'
  | 'slyDeal'
  | 'forcedDeal'
  | 'dealBreaker'
  | 'justSayNo'
  | 'house'
  | 'hotel'
  | 'doubleTheRent';

export interface MoneyCard {
  id: string;
  type: 'money';
  value: number; // 1, 2, 3, 4, 5, or 10
}

export interface PropertyCard {
  id: string;
  type: 'property';
  color: PropertyColor;
  name: string;
  value: number; // monetary value when used for payment
}

export interface WildcardCard {
  id: string;
  type: 'wildcard';
  colors: PropertyColor[] | 'all'; // dual-color pair or 'all' for rainbow
  value: number; // 0 for rainbow wildcards
  currentColor?: PropertyColor; // which color it's currently assigned to
}

export interface ActionCard {
  id: string;
  type: 'action';
  action: ActionType;
  value: number; // bank value
}

export interface RentCard {
  id: string;
  type: 'rent';
  colors: PropertyColor[] | 'all'; // dual-color pair or 'all' for wild rent
  value: number; // bank value (1 for dual, 3 for wild)
}

export type Card = MoneyCard | PropertyCard | WildcardCard | ActionCard | RentCard;

export interface PropertySet {
  color: PropertyColor;
  cards: (PropertyCard | WildcardCard)[]; // properties in this set
  house: boolean;
  hotel: boolean;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  bank: Card[];
  properties: PropertySet[];
  isAI: boolean;
  aiPersonality?: string;
}

export type GamePhase = 'draw' | 'play' | 'discard' | 'waitingForResponse' | 'gameOver';

export interface PendingAction {
  type: ActionType | 'rent';
  sourcePlayerId: string;
  targetPlayerIds: string[];
  amount?: number; // for payment actions
  card?: Card; // the action card played
  rentCard?: RentCard; // for rent actions
  doubleCount?: number; // how many times rent is doubled
  respondedPlayers: string[]; // players who have already responded
  justSayNoChain?: {
    initiatorId: string;
    targetId: string;
    depth: number; // how deep in the chain we are
  };
  // For sly deal / forced deal
  targetCardId?: string;
  offeredCardId?: string; // for forced deal
  targetSetColor?: PropertyColor; // for deal breaker
}

export interface GameState {
  id: string;
  players: Player[];
  drawPile: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  phase: GamePhase;
  actionsRemaining: number;
  pendingAction: PendingAction | null;
  winner: string | null; // player id
  turnNumber: number;
  log: GameLogEntry[];
}

export interface GameLogEntry {
  turnNumber: number;
  playerId: string;
  action: string;
  details?: string;
  timestamp: number;
}

// What a player can see (hidden info removed)
export interface PlayerView {
  gameId: string;
  myId: string;
  myHand: Card[];
  myBank: Card[];
  myProperties: PropertySet[];
  opponents: OpponentView[];
  drawPileCount: number;
  discardPile: Card[];
  currentPlayerIndex: number;
  currentPlayerId: string;
  phase: GamePhase;
  actionsRemaining: number;
  pendingAction: PendingAction | null;
  winner: string | null;
  turnNumber: number;
  log: GameLogEntry[];
}

export interface OpponentView {
  id: string;
  name: string;
  handCount: number;
  bank: Card[];
  properties: PropertySet[];
  isAI: boolean;
}

// Actions the player can take
export type PlayerAction =
  | { type: 'playCard'; cardId: string; asBank?: boolean }
  | { type: 'playDebtCollector'; cardId: string; targetPlayerId: string }
  | { type: 'playRent'; cardId: string; targetColor: PropertyColor; targetPlayerId?: string; doubleCardIds?: string[] }
  | { type: 'playSlyDeal'; cardId: string; targetPlayerId: string; targetCardId: string }
  | { type: 'playForcedDeal'; cardId: string; targetPlayerId: string; targetCardId: string; offeredCardId: string }
  | { type: 'playDealBreaker'; cardId: string; targetPlayerId: string; targetColor: PropertyColor }
  | { type: 'playHouse'; cardId: string; targetColor: PropertyColor }
  | { type: 'playHotel'; cardId: string; targetColor: PropertyColor }
  | { type: 'playProperty'; cardId: string; color?: PropertyColor } // color for wildcards
  | { type: 'respondJustSayNo'; cardId: string }
  | { type: 'respondPay'; cardIds: string[] }
  | { type: 'respondAccept' } // accept the action (don't say no)
  | { type: 'rearrangeWildcard'; cardId: string; fromColor: PropertyColor; toColor: PropertyColor }
  | { type: 'endTurn' }
  | { type: 'discard'; cardIds: string[] };

// Property set completion requirements
export const SET_SIZES: Record<PropertyColor, number> = {
  brown: 2,
  lightBlue: 3,
  pink: 3,
  orange: 3,
  red: 3,
  yellow: 3,
  green: 3,
  darkBlue: 2,
  railroad: 4,
  utility: 2,
};

// Rent values per color per card count
export const RENT_VALUES: Record<PropertyColor, number[]> = {
  brown: [1, 2],
  lightBlue: [1, 2, 3],
  pink: [1, 2, 4],
  orange: [1, 3, 5],
  red: [2, 3, 6],
  yellow: [2, 4, 6],
  green: [2, 4, 7],
  darkBlue: [3, 8],
  railroad: [1, 2, 3, 4],
  utility: [1, 2],
};

export const COLOR_NAMES: Record<PropertyColor, string> = {
  brown: 'Brown',
  lightBlue: 'Light Blue',
  pink: 'Pink',
  orange: 'Orange',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  darkBlue: 'Dark Blue',
  railroad: 'Railroad',
  utility: 'Utility',
};

export const COLOR_HEX: Record<PropertyColor, string> = {
  brown: '#8B4513',
  lightBlue: '#87CEEB',
  pink: '#FF69B4',
  orange: '#FF8C00',
  red: '#DC143C',
  yellow: '#FFD700',
  green: '#228B22',
  darkBlue: '#00008B',
  railroad: '#333333',
  utility: '#90EE90',
};
