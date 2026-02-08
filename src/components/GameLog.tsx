'use client';

import React, { useEffect, useRef } from 'react';
import { GameLogEntry } from '@/game/types';

interface GameLogProps {
  entries: GameLogEntry[];
  playerNames: Record<string, string>;
}

const ACTION_EMOJIS: Record<string, string> = {
  draw: '🃏',
  bank: '💰',
  passGo: '🎯',
  property: '🏠',
  wildcard: '🌈',
  rent: '💸',
  debtCollector: '💳',
  birthday: '🎂',
  slyDeal: '🦊',
  slyDealSuccess: '🦊',
  forcedDeal: '🔄',
  forcedDealSuccess: '🔄',
  dealBreaker: '💥',
  dealBreakerSuccess: '💥',
  justSayNo: '🚫',
  house: '🏡',
  hotel: '🏨',
  pay: '💵',
  win: '🏆',
};

export default function GameLog({ entries, playerNames }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-3 h-48 overflow-y-auto text-xs">
      <div className="font-semibold text-gray-400 uppercase text-[10px] mb-2">Game Log</div>
      {entries.map((entry, i) => {
        const emoji = ACTION_EMOJIS[entry.action] || '▪';
        const name = playerNames[entry.playerId] || entry.playerId;
        return (
          <div key={i} className="text-gray-300 py-0.5 border-b border-gray-800 last:border-0">
            <span className="text-gray-500">T{entry.turnNumber}</span>
            {' '}{emoji}{' '}
            <span className="font-semibold text-gray-200">{name}</span>
            {' '}{entry.details || entry.action}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
