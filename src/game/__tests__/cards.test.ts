import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck } from '../cards';
import { Card } from '../types';

describe('createDeck', () => {
  const deck = createDeck();

  it('creates exactly 108 playable cards', () => {
    expect(deck).toHaveLength(108);
  });

  it('has unique IDs for all cards', () => {
    const ids = deck.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(108);
  });

  describe('money cards', () => {
    const moneyCards = deck.filter(c => c.type === 'money');

    it('has exactly 20 money cards', () => {
      expect(moneyCards).toHaveLength(20);
    });

    it('has correct denominations: 6x$1, 5x$2, 3x$3, 3x$4, 2x$5, 1x$10', () => {
      const counts: Record<number, number> = {};
      for (const c of moneyCards) {
        counts[c.value] = (counts[c.value] || 0) + 1;
      }
      expect(counts[1]).toBe(6);
      expect(counts[2]).toBe(5);
      expect(counts[3]).toBe(3);
      expect(counts[4]).toBe(3);
      expect(counts[5]).toBe(2);
      expect(counts[10]).toBe(1);
    });

    it('totals $57M in money', () => {
      const total = moneyCards.reduce((sum, c) => sum + c.value, 0);
      expect(total).toBe(6 * 1 + 5 * 2 + 3 * 3 + 3 * 4 + 2 * 5 + 10);
      expect(total).toBe(57);
    });
  });

  describe('property cards', () => {
    const properties = deck.filter(c => c.type === 'property');

    it('has exactly 28 property cards', () => {
      expect(properties).toHaveLength(28);
    });

    it('has correct count per color', () => {
      const colorCounts: Record<string, number> = {};
      for (const c of properties) {
        if (c.type === 'property') {
          colorCounts[c.color] = (colorCounts[c.color] || 0) + 1;
        }
      }
      expect(colorCounts['brown']).toBe(2);
      expect(colorCounts['lightBlue']).toBe(3);
      expect(colorCounts['pink']).toBe(3);
      expect(colorCounts['orange']).toBe(3);
      expect(colorCounts['red']).toBe(3);
      expect(colorCounts['yellow']).toBe(3);
      expect(colorCounts['green']).toBe(3);
      expect(colorCounts['darkBlue']).toBe(2);
      expect(colorCounts['railroad']).toBe(4);
      expect(colorCounts['utility']).toBe(2);
    });

    it('has correct property values per color', () => {
      for (const c of properties) {
        if (c.type !== 'property') continue;
        switch (c.color) {
          case 'brown':
          case 'lightBlue':
            expect(c.value).toBe(1);
            break;
          case 'pink':
          case 'orange':
          case 'railroad':
          case 'utility':
            expect(c.value).toBe(2);
            break;
          case 'red':
          case 'yellow':
            expect(c.value).toBe(3);
            break;
          case 'green':
          case 'darkBlue':
            expect(c.value).toBe(4);
            break;
        }
      }
    });
  });

  describe('wildcard cards', () => {
    const wildcards = deck.filter(c => c.type === 'wildcard');

    it('has exactly 11 wildcard cards', () => {
      expect(wildcards).toHaveLength(11);
    });

    it('has 2 rainbow wildcards with value 0', () => {
      const rainbow = wildcards.filter(c => c.type === 'wildcard' && c.colors === 'all');
      expect(rainbow).toHaveLength(2);
      for (const c of rainbow) {
        expect(c.value).toBe(0);
      }
    });

    it('has 9 dual-color wildcards', () => {
      const dual = wildcards.filter(c => c.type === 'wildcard' && c.colors !== 'all');
      expect(dual).toHaveLength(9);
    });

    it('dual-color wildcards have correct color pairs', () => {
      const dual = wildcards.filter(c => c.type === 'wildcard' && c.colors !== 'all');
      const pairs = dual.map(c => {
        if (c.type === 'wildcard' && c.colors !== 'all') {
          return c.colors.sort().join('/');
        }
        return '';
      }).sort();
      expect(pairs).toContain('brown/lightBlue');
      expect(pairs).toContain('orange/pink');
      expect(pairs).toContain('railroad/utility');
      expect(pairs).toContain('red/yellow');
      expect(pairs).toContain('darkBlue/green');
      expect(pairs).toContain('green/railroad');
      expect(pairs).toContain('lightBlue/railroad');
    });
  });

  describe('rent cards', () => {
    const rentCards = deck.filter(c => c.type === 'rent');

    it('has exactly 13 rent cards', () => {
      expect(rentCards).toHaveLength(13);
    });

    it('has 3 wild rent cards with value $3M', () => {
      const wild = rentCards.filter(c => c.type === 'rent' && c.colors === 'all');
      expect(wild).toHaveLength(3);
      for (const c of wild) {
        expect(c.value).toBe(3);
      }
    });

    it('has 10 dual-color rent cards with value $1M', () => {
      const dual = rentCards.filter(c => c.type === 'rent' && c.colors !== 'all');
      expect(dual).toHaveLength(10);
      for (const c of dual) {
        expect(c.value).toBe(1);
      }
    });
  });

  describe('action cards', () => {
    const actions = deck.filter(c => c.type === 'action');

    it('has exactly 36 action cards', () => {
      expect(actions).toHaveLength(36);
    });

    it('has correct counts per action type', () => {
      const counts: Record<string, number> = {};
      for (const c of actions) {
        if (c.type === 'action') {
          counts[c.action] = (counts[c.action] || 0) + 1;
        }
      }
      expect(counts['passGo']).toBe(10);
      expect(counts['itIsMyBirthday']).toBe(3);
      expect(counts['slyDeal']).toBe(3);
      expect(counts['forcedDeal']).toBe(4);
      expect(counts['debtCollector']).toBe(3);
      expect(counts['house']).toBe(3);
      expect(counts['justSayNo']).toBe(3);
      expect(counts['hotel']).toBe(3);
      expect(counts['dealBreaker']).toBe(2);
      expect(counts['doubleTheRent']).toBe(2);
    });

    it('has correct bank values per action type', () => {
      for (const c of actions) {
        if (c.type !== 'action') continue;
        const expected: Record<string, number> = {
          passGo: 1, itIsMyBirthday: 2, slyDeal: 3, forcedDeal: 3,
          debtCollector: 3, house: 3, justSayNo: 4, hotel: 4,
          dealBreaker: 5, doubleTheRent: 1,
        };
        expect(c.value).toBe(expected[c.action]);
      }
    });
  });

  it('total card type counts add up: 20+28+11+13+36 = 108', () => {
    const money = deck.filter(c => c.type === 'money').length;
    const property = deck.filter(c => c.type === 'property').length;
    const wildcard = deck.filter(c => c.type === 'wildcard').length;
    const rent = deck.filter(c => c.type === 'rent').length;
    const action = deck.filter(c => c.type === 'action').length;
    expect(money + property + wildcard + rent + action).toBe(108);
  });
});

describe('shuffleDeck', () => {
  it('returns a deck of the same length', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(deck.length);
  });

  it('does not mutate the original deck', () => {
    const deck = createDeck();
    const original = [...deck];
    shuffleDeck(deck);
    expect(deck.map(c => c.id)).toEqual(original.map(c => c.id));
  });

  it('contains the same cards (just reordered)', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    const originalIds = deck.map(c => c.id).sort();
    const shuffledIds = shuffled.map(c => c.id).sort();
    expect(shuffledIds).toEqual(originalIds);
  });

  it('produces a different order (with overwhelming probability)', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    // At least some cards should be in different positions
    let differences = 0;
    for (let i = 0; i < deck.length; i++) {
      if (deck[i].id !== shuffled[i].id) differences++;
    }
    expect(differences).toBeGreaterThan(50); // very conservative
  });
});
