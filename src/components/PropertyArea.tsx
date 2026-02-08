'use client';

import React from 'react';
import Card from './Card';
import { PropertySet, COLOR_NAMES, COLOR_HEX, SET_SIZES, RENT_VALUES, Card as CardType } from '@/game/types';
import { isSetComplete } from '@/game/engine';

interface PropertyAreaProps {
  sets: PropertySet[];
  onCardClick?: (card: CardType, setColor: string) => void;
  small?: boolean;
  label?: string;
}

export default function PropertyArea({ sets, onCardClick, small, label }: PropertyAreaProps) {
  if (sets.length === 0) {
    return (
      <div className="text-gray-500 text-sm italic p-2">
        {label ? `${label}: ` : ''}No properties
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label && <div className="text-xs font-semibold text-gray-400 uppercase">{label}</div>}
      <div className="flex flex-wrap gap-3">
        {sets.map((set, idx) => {
          const complete = isSetComplete(set);
          const needed = SET_SIZES[set.color];
          const rentTable = RENT_VALUES[set.color];
          const currentRent = set.cards.length > 0 ? rentTable[Math.min(set.cards.length, rentTable.length) - 1] : 0;
          let totalRent = currentRent;
          if (set.house) totalRent += 3;
          if (set.hotel) totalRent += 4;

          return (
            <div
              key={`${set.color}-${idx}`}
              className={`rounded-lg p-2 border-2 ${complete ? 'border-yellow-400 bg-yellow-400/10' : 'border-gray-700 bg-gray-800/50'}`}
            >
              <div className="flex items-center gap-1 mb-1">
                <div
                  className="w-3 h-3 rounded-full border border-white/30"
                  style={{ backgroundColor: COLOR_HEX[set.color] }}
                />
                <span className="text-xs font-bold" style={{ color: COLOR_HEX[set.color] }}>
                  {COLOR_NAMES[set.color]}
                </span>
                <span className="text-[10px] text-gray-400">
                  {set.cards.length}/{needed}
                </span>
                {complete && <span className="text-[10px] text-yellow-400 font-bold">COMPLETE</span>}
                <span className="text-[10px] text-green-400 ml-auto">${totalRent}M rent</span>
              </div>
              {(set.house || set.hotel) && (
                <div className="flex gap-1 mb-1">
                  {set.house && <span className="text-[10px] bg-amber-700 text-white px-1 rounded">House</span>}
                  {set.hotel && <span className="text-[10px] bg-red-700 text-white px-1 rounded">Hotel</span>}
                </div>
              )}
              <div className="flex gap-1 flex-wrap">
                {set.cards.map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    small={small ?? true}
                    onClick={onCardClick ? () => onCardClick(card, set.color) : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
