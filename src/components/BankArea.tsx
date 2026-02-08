'use client';

import React from 'react';
import Card from './Card';
import { Card as CardType } from '@/game/types';

interface BankAreaProps {
  cards: CardType[];
  onCardClick?: (card: CardType) => void;
  selectedIds?: string[];
  label?: string;
}

export default function BankArea({ cards, onCardClick, selectedIds, label }: BankAreaProps) {
  const total = cards.reduce((sum, c) => sum + c.value, 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-gray-400 uppercase">{label || 'Bank'}</span>
        <span className="text-sm font-bold text-green-400">${total}M</span>
        <span className="text-xs text-gray-500">({cards.length} cards)</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        {cards.length === 0 ? (
          <span className="text-gray-500 text-sm italic">Empty</span>
        ) : (
          cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              small
              selected={selectedIds?.includes(card.id)}
              onClick={onCardClick ? () => onCardClick(card) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
