// ============================================================
// Monopoly Deal - Complete Card Definitions (106 playable cards)
// ============================================================

import {
  Card,
  MoneyCard,
  PropertyCard,
  WildcardCard,
  ActionCard,
  RentCard,
  PropertyColor,
} from './types';

let cardCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${++cardCounter}`;
}

function money(value: number): MoneyCard {
  return { id: nextId('money'), type: 'money', value };
}

function property(color: PropertyColor, name: string, value: number): PropertyCard {
  return { id: nextId('prop'), type: 'property', color, name, value };
}

function wildcard(colors: PropertyColor[] | 'all', value: number): WildcardCard {
  return { id: nextId('wild'), type: 'wildcard', colors, value };
}

function action(actionType: ActionCard['action'], value: number): ActionCard {
  return { id: nextId('action'), type: 'action', action: actionType, value };
}

function rent(colors: PropertyColor[] | 'all', value: number): RentCard {
  return { id: nextId('rent'), type: 'rent', colors, value };
}

export function createDeck(): Card[] {
  cardCounter = 0;
  const cards: Card[] = [];

  // === Money Cards (20) ===
  for (let i = 0; i < 6; i++) cards.push(money(1));
  for (let i = 0; i < 5; i++) cards.push(money(2));
  for (let i = 0; i < 3; i++) cards.push(money(3));
  for (let i = 0; i < 3; i++) cards.push(money(4));
  for (let i = 0; i < 2; i++) cards.push(money(5));
  cards.push(money(10));

  // === Property Cards (28) ===
  // Brown (2)
  cards.push(property('brown', 'Mediterranean Avenue', 1));
  cards.push(property('brown', 'Baltic Avenue', 1));
  // Light Blue (3)
  cards.push(property('lightBlue', 'Oriental Avenue', 1));
  cards.push(property('lightBlue', 'Vermont Avenue', 1));
  cards.push(property('lightBlue', 'Connecticut Avenue', 1));
  // Pink (3)
  cards.push(property('pink', 'St. Charles Place', 2));
  cards.push(property('pink', 'States Avenue', 2));
  cards.push(property('pink', 'Virginia Avenue', 2));
  // Orange (3)
  cards.push(property('orange', 'St. James Place', 2));
  cards.push(property('orange', 'Tennessee Avenue', 2));
  cards.push(property('orange', 'New York Avenue', 2));
  // Red (3)
  cards.push(property('red', 'Kentucky Avenue', 3));
  cards.push(property('red', 'Indiana Avenue', 3));
  cards.push(property('red', 'Illinois Avenue', 3));
  // Yellow (3)
  cards.push(property('yellow', 'Atlantic Avenue', 3));
  cards.push(property('yellow', 'Ventnor Avenue', 3));
  cards.push(property('yellow', 'Marvin Gardens', 3));
  // Green (3)
  cards.push(property('green', 'Pacific Avenue', 4));
  cards.push(property('green', 'North Carolina Avenue', 4));
  cards.push(property('green', 'Pennsylvania Avenue', 4));
  // Dark Blue (2)
  cards.push(property('darkBlue', 'Park Place', 4));
  cards.push(property('darkBlue', 'Boardwalk', 4));
  // Railroad (4)
  cards.push(property('railroad', 'Reading Railroad', 2));
  cards.push(property('railroad', 'Pennsylvania Railroad', 2));
  cards.push(property('railroad', 'B&O Railroad', 2));
  cards.push(property('railroad', 'Short Line', 2));
  // Utility (2)
  cards.push(property('utility', 'Electric Company', 2));
  cards.push(property('utility', 'Water Works', 2));

  // === Property Wildcards (11) ===
  // Dual-color (9)
  cards.push(wildcard(['lightBlue', 'brown'], 1));
  cards.push(wildcard(['pink', 'orange'], 2));
  cards.push(wildcard(['pink', 'orange'], 2));
  cards.push(wildcard(['railroad', 'utility'], 2));
  cards.push(wildcard(['red', 'yellow'], 3));
  cards.push(wildcard(['red', 'yellow'], 3));
  cards.push(wildcard(['darkBlue', 'green'], 4));
  cards.push(wildcard(['green', 'railroad'], 4));
  cards.push(wildcard(['lightBlue', 'railroad'], 4));
  // Rainbow (2) - value 0
  cards.push(wildcard('all', 0));
  cards.push(wildcard('all', 0));

  // === Rent Cards (13) ===
  // Dual-color rent (10)
  cards.push(rent(['brown', 'lightBlue'], 1));
  cards.push(rent(['brown', 'lightBlue'], 1));
  cards.push(rent(['pink', 'orange'], 1));
  cards.push(rent(['pink', 'orange'], 1));
  cards.push(rent(['red', 'yellow'], 1));
  cards.push(rent(['red', 'yellow'], 1));
  cards.push(rent(['green', 'darkBlue'], 1));
  cards.push(rent(['green', 'darkBlue'], 1));
  cards.push(rent(['railroad', 'utility'], 1));
  cards.push(rent(['railroad', 'utility'], 1));
  // Wild rent (3)
  cards.push(rent('all', 3));
  cards.push(rent('all', 3));
  cards.push(rent('all', 3));

  // === Action Cards (34) ===
  // Pass Go (10)
  for (let i = 0; i < 10; i++) cards.push(action('passGo', 1));
  // It's My Birthday (3)
  for (let i = 0; i < 3; i++) cards.push(action('itIsMyBirthday', 2));
  // Sly Deal (3)
  for (let i = 0; i < 3; i++) cards.push(action('slyDeal', 3));
  // Forced Deal (4)
  for (let i = 0; i < 4; i++) cards.push(action('forcedDeal', 3));
  // Debt Collector (3)
  for (let i = 0; i < 3; i++) cards.push(action('debtCollector', 3));
  // House (3)
  for (let i = 0; i < 3; i++) cards.push(action('house', 3));
  // Just Say No (3)
  for (let i = 0; i < 3; i++) cards.push(action('justSayNo', 4));
  // Hotel (3)
  for (let i = 0; i < 3; i++) cards.push(action('hotel', 4));
  // Deal Breaker (2)
  for (let i = 0; i < 2; i++) cards.push(action('dealBreaker', 5));
  // Double the Rent (2)
  for (let i = 0; i < 2; i++) cards.push(action('doubleTheRent', 1));

  return cards;
}

// Fisher-Yates shuffle
export function shuffleDeck(cards: Card[]): Card[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
