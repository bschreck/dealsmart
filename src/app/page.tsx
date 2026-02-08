'use client';

import React, { useState, useCallback } from 'react';
import GameBoard from '@/components/GameBoard';
import { PlayerView, PlayerAction } from '@/game/types';

type Screen = 'menu' | 'game';

export default function Home() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [view, setView] = useState<PlayerView | null>(null);
  const [gameId, setGameId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [aiCount, setAiCount] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const startGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: playerName || 'You',
          aiCount,
          aiPersonalities: ['aggressive', 'balanced', 'defensive'].slice(0, aiCount),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGameId(data.gameId);
      setView(data.view);
      setScreen('game');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [playerName, aiCount]);

  const handleAction = useCallback(async (action: PlayerAction) => {
    if (!gameId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId,
          playerId: 'player_0',
          action,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setView(data.view);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [gameId, loading]);

  if (screen === 'menu') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-black text-yellow-400 mb-2">DealSmart</h1>
            <p className="text-gray-400 text-lg">Monopoly Deal vs AI</p>
            <p className="text-gray-600 text-sm mt-1">Powered by Claude Opus 4.6</p>
          </div>

          <div className="bg-gray-900 rounded-2xl p-6 border border-gray-700 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                AI Opponents ({aiCount})
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setAiCount(n)}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${
                      aiCount === n
                        ? 'bg-yellow-500 text-black'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span>Alex (Aggressive) - Attacks early and often</span>
              </div>
              {aiCount >= 2 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Bailey (Balanced) - Adapts to the situation</span>
                </div>
              )}
              {aiCount >= 3 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span>Casey (Defensive) - Builds quietly, wins suddenly</span>
                </div>
              )}
              {aiCount >= 4 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span>AI 4 (Balanced)</span>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-500 rounded-lg p-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={startGame}
              disabled={loading}
              className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 text-black font-bold py-3 px-6 rounded-lg text-lg transition-colors"
            >
              {loading ? 'Setting up...' : 'Start Game'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <details className="text-gray-500 text-xs">
              <summary className="cursor-pointer hover:text-gray-300">How to Play</summary>
              <div className="mt-2 text-left space-y-2 bg-gray-900 rounded-lg p-4 border border-gray-700">
                <p><strong className="text-gray-300">Goal:</strong> Complete 3 property sets of different colors.</p>
                <p><strong className="text-gray-300">Each turn:</strong> Draw 2 cards, play up to 3, hand limit 7.</p>
                <p><strong className="text-gray-300">Cards:</strong> Click cards in your hand to play them.</p>
                <p><strong className="text-gray-300">Money:</strong> Money goes to your bank. Action cards can be banked too.</p>
                <p><strong className="text-gray-300">Actions:</strong> Use Deal Breaker, Sly Deal, Rent, etc. to attack opponents.</p>
                <p><strong className="text-gray-300">Defense:</strong> Just Say No blocks any action against you.</p>
                <p><strong className="text-gray-300">AI:</strong> Opponents use Claude Opus 4.6 with persistent memory - they learn!</p>
              </div>
            </details>
          </div>
        </div>
      </div>
    );
  }

  if (!view) return null;

  return (
    <>
      {error && (
        <div className="fixed top-4 right-4 bg-red-900/90 border border-red-500 rounded-lg p-3 text-red-300 text-sm z-50 max-w-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300">x</button>
        </div>
      )}
      <GameBoard view={view} onAction={handleAction} loading={loading} />
    </>
  );
}
