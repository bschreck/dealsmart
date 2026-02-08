'use client';

import React from 'react';
import {
  Card as CardType,
  PropertyColor,
  COLOR_HEX,
  COLOR_NAMES,
} from '@/game/types';

const ACTION_COLORS: Record<string, string> = {
  passGo: '#4CAF50',
  debtCollector: '#F44336',
  itIsMyBirthday: '#E91E63',
  slyDeal: '#9C27B0',
  forcedDeal: '#673AB7',
  dealBreaker: '#B71C1C',
  justSayNo: '#FF5722',
  house: '#795548',
  hotel: '#D32F2F',
  doubleTheRent: '#FF9800',
};

const ACTION_NAMES: Record<string, string> = {
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

interface CardProps {
  card: CardType;
  onClick?: () => void;
  selected?: boolean;
  small?: boolean;
  faceDown?: boolean;
}

export default function Card({ card, onClick, selected, small, faceDown }: CardProps) {
  const size = small ? 'w-16 h-24 text-[9px]' : 'w-24 h-36 text-xs';
  const baseClasses = `${size} rounded-lg border-2 flex flex-col justify-between p-1.5 cursor-pointer transition-all font-bold select-none overflow-hidden`;

  if (faceDown) {
    return (
      <div className={`${baseClasses} bg-indigo-800 border-indigo-950 text-white items-center justify-center`}>
        <div className="text-2xl">?</div>
      </div>
    );
  }

  const selectedClass = selected ? 'ring-3 ring-yellow-400 scale-105 -translate-y-1' : '';
  const hoverClass = onClick ? 'hover:scale-105 hover:-translate-y-1' : '';

  function renderCard() {
    switch (card.type) {
      case 'money':
        return (
          <div
            className={`${baseClasses} ${selectedClass} ${hoverClass} bg-gradient-to-b from-green-100 to-green-200 border-green-600 text-green-900`}
            onClick={onClick}
          >
            <div className="text-right font-black">${card.value}M</div>
            <div className="text-center text-lg font-black">${card.value}M</div>
            <div className="text-left font-black">${card.value}M</div>
          </div>
        );

      case 'property': {
        const bgColor = COLOR_HEX[card.color];
        const isLight = ['yellow', 'lightBlue', 'utility'].includes(card.color);
        return (
          <div
            className={`${baseClasses} ${selectedClass} ${hoverClass} border-gray-800`}
            style={{ backgroundColor: bgColor, color: isLight ? '#1a1a1a' : '#fff' }}
            onClick={onClick}
          >
            <div className="text-right">${card.value}M</div>
            <div className="text-center leading-tight font-black" style={{ fontSize: small ? '7px' : '10px' }}>
              {card.name}
            </div>
            <div className="text-center opacity-75" style={{ fontSize: small ? '6px' : '8px' }}>
              {COLOR_NAMES[card.color]}
            </div>
          </div>
        );
      }

      case 'wildcard': {
        if (card.colors === 'all') {
          return (
            <div
              className={`${baseClasses} ${selectedClass} ${hoverClass} border-gray-800`}
              style={{
                background: 'linear-gradient(135deg, #DC143C 0%, #FF8C00 20%, #FFD700 40%, #228B22 60%, #00008B 80%, #9C27B0 100%)',
                color: '#fff',
              }}
              onClick={onClick}
            >
              <div className="text-right">$0M</div>
              <div className="text-center font-black text-sm">WILD</div>
              <div className="text-center" style={{ fontSize: small ? '6px' : '8px' }}>Any Color</div>
            </div>
          );
        }
        const [c1, c2] = card.colors;
        return (
          <div
            className={`${baseClasses} ${selectedClass} ${hoverClass} border-gray-800`}
            style={{
              background: `linear-gradient(135deg, ${COLOR_HEX[c1]} 50%, ${COLOR_HEX[c2]} 50%)`,
              color: '#fff',
            }}
            onClick={onClick}
          >
            <div className="text-right bg-black/30 rounded px-0.5">${card.value}M</div>
            <div className="text-center font-black bg-black/40 rounded px-1">WILD</div>
            <div className="text-center bg-black/30 rounded px-0.5" style={{ fontSize: small ? '6px' : '8px' }}>
              {COLOR_NAMES[c1]}/{COLOR_NAMES[c2]}
            </div>
          </div>
        );
      }

      case 'action': {
        const bgColor = ACTION_COLORS[card.action] || '#666';
        return (
          <div
            className={`${baseClasses} ${selectedClass} ${hoverClass} border-gray-800 text-white`}
            style={{ backgroundColor: bgColor }}
            onClick={onClick}
          >
            <div className="text-right">${card.value}M</div>
            <div className="text-center font-black leading-tight" style={{ fontSize: small ? '7px' : '10px' }}>
              {ACTION_NAMES[card.action]}
            </div>
            <div className="text-center opacity-75" style={{ fontSize: small ? '6px' : '8px' }}>Action</div>
          </div>
        );
      }

      case 'rent': {
        if (card.colors === 'all') {
          return (
            <div
              className={`${baseClasses} ${selectedClass} ${hoverClass} border-gray-800`}
              style={{
                background: 'linear-gradient(135deg, #4CAF50 0%, #2196F3 50%, #F44336 100%)',
                color: '#fff',
              }}
              onClick={onClick}
            >
              <div className="text-right">${card.value}M</div>
              <div className="text-center font-black">RENT</div>
              <div className="text-center" style={{ fontSize: small ? '6px' : '8px' }}>Wild</div>
            </div>
          );
        }
        const [rc1, rc2] = card.colors;
        return (
          <div
            className={`${baseClasses} ${selectedClass} ${hoverClass} border-gray-800`}
            style={{
              background: `linear-gradient(135deg, ${COLOR_HEX[rc1]} 50%, ${COLOR_HEX[rc2]} 50%)`,
              color: '#fff',
            }}
            onClick={onClick}
          >
            <div className="text-right bg-black/30 rounded px-0.5">${card.value}M</div>
            <div className="text-center font-black bg-black/40 rounded px-1">RENT</div>
            <div className="text-center bg-black/30 rounded px-0.5" style={{ fontSize: small ? '6px' : '8px' }}>
              {COLOR_NAMES[rc1]}/{COLOR_NAMES[rc2]}
            </div>
          </div>
        );
      }
    }
  }

  return renderCard();
}
