'use client';

import React, { useState, useCallback } from 'react';
import Card from './Card';
import PropertyArea from './PropertyArea';
import BankArea from './BankArea';
import GameLog from './GameLog';
import {
  PlayerView,
  PlayerAction,
  Card as CardType,
  PropertyColor,
  COLOR_NAMES,
  COLOR_HEX,
  SET_SIZES,
  ActionCard,
  RentCard,
  WildcardCard,
  PendingAction,
} from '@/game/types';
import { isSetComplete, cardDescription } from '@/game/engine';

interface GameBoardProps {
  view: PlayerView;
  onAction: (action: PlayerAction) => void;
  loading: boolean;
}

type InteractionMode =
  | { type: 'none' }
  | { type: 'selectTarget'; cardId: string; actionType: string }
  | { type: 'selectColor'; cardId: string; colors: PropertyColor[] }
  | { type: 'selectPropertyToSteal'; cardId: string }
  | { type: 'selectMyPropertyToOffer'; cardId: string; targetPlayerId: string; targetCardId: string }
  | { type: 'selectSetToSteal'; cardId: string }
  | { type: 'selectSetForBuilding'; cardId: string; buildingType: 'house' | 'hotel' }
  | { type: 'selectPayment'; amount: number; selectedIds: string[] }
  | { type: 'selectDiscard'; selectedIds: string[] }
  | { type: 'selectRentColor'; cardId: string; colors: PropertyColor[] }
  | { type: 'selectRentTarget'; cardId: string; color: PropertyColor; isWild: boolean }
  | { type: 'confirmAction'; description: string; action: PlayerAction };

export default function GameBoard({ view, onAction, loading }: GameBoardProps) {
  const [mode, setMode] = useState<InteractionMode>({ type: 'none' });

  const isMyTurn = view.currentPlayerId === view.myId;
  const needsResponse = view.pendingAction &&
    view.pendingAction.targetPlayerIds.includes(view.myId) &&
    !view.pendingAction.respondedPlayers.includes(view.myId);

  const playerNames: Record<string, string> = {
    [view.myId]: 'You',
  };
  for (const opp of view.opponents) {
    playerNames[opp.id] = opp.name;
  }

  const resetMode = useCallback(() => setMode({ type: 'none' }), []);

  // === Handle clicking a card in hand ===
  const handleHandCardClick = useCallback((card: CardType) => {
    if (loading) return;
    if (!isMyTurn || view.phase !== 'play' || view.actionsRemaining <= 0) return;

    if (mode.type === 'selectDiscard') {
      const ids = mode.selectedIds.includes(card.id)
        ? mode.selectedIds.filter(id => id !== card.id)
        : [...mode.selectedIds, card.id];
      setMode({ type: 'selectDiscard', selectedIds: ids });
      return;
    }

    switch (card.type) {
      case 'money':
        // Money always goes to bank
        onAction({ type: 'playCard', cardId: card.id });
        break;

      case 'property':
        onAction({ type: 'playProperty', cardId: card.id });
        break;

      case 'wildcard': {
        const wc = card as WildcardCard;
        const colors: PropertyColor[] = wc.colors === 'all'
          ? ['brown', 'lightBlue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkBlue', 'railroad', 'utility']
          : wc.colors;
        setMode({ type: 'selectColor', cardId: card.id, colors });
        break;
      }

      case 'rent': {
        const rc = card as RentCard;
        const myColors = view.myProperties.map(s => s.color);
        const availableColors = rc.colors === 'all'
          ? myColors
          : (rc.colors as PropertyColor[]).filter(c => myColors.includes(c));
        if (availableColors.length === 0) {
          // Bank it instead
          setMode({
            type: 'confirmAction',
            description: `Bank ${cardDescription(card)} as $${card.value}M?`,
            action: { type: 'playCard', cardId: card.id, asBank: true },
          });
        } else if (availableColors.length === 1) {
          if (rc.colors === 'all') {
            // Wild rent - need to pick a target
            setMode({ type: 'selectRentTarget', cardId: card.id, color: availableColors[0], isWild: true });
          } else {
            onAction({ type: 'playRent', cardId: card.id, targetColor: availableColors[0] });
          }
        } else {
          setMode({ type: 'selectRentColor', cardId: card.id, colors: availableColors });
        }
        break;
      }

      case 'action': {
        const ac = card as ActionCard;
        switch (ac.action) {
          case 'passGo':
            onAction({ type: 'playCard', cardId: card.id });
            break;
          case 'itIsMyBirthday':
            onAction({ type: 'playCard', cardId: card.id });
            break;
          case 'debtCollector':
            setMode({ type: 'selectTarget', cardId: card.id, actionType: 'debtCollector' });
            break;
          case 'slyDeal':
            setMode({ type: 'selectPropertyToSteal', cardId: card.id });
            break;
          case 'forcedDeal':
            setMode({ type: 'selectPropertyToSteal', cardId: card.id });
            break;
          case 'dealBreaker':
            setMode({ type: 'selectSetToSteal', cardId: card.id });
            break;
          case 'house':
            setMode({ type: 'selectSetForBuilding', cardId: card.id, buildingType: 'house' });
            break;
          case 'hotel':
            setMode({ type: 'selectSetForBuilding', cardId: card.id, buildingType: 'hotel' });
            break;
          case 'justSayNo':
          case 'doubleTheRent':
            // These are reactive or combo-only; bank them
            setMode({
              type: 'confirmAction',
              description: `Bank ${cardDescription(card)} as $${card.value}M?`,
              action: { type: 'playCard', cardId: card.id, asBank: true },
            });
            break;
        }
        break;
      }
    }
  }, [isMyTurn, view, mode, loading, onAction]);

  // === Render opponent areas ===
  const renderOpponents = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {view.opponents.map((opp) => {
        const completeSets = opp.properties.filter(isSetComplete).length;
        const isTarget = mode.type === 'selectTarget' ||
          mode.type === 'selectPropertyToSteal' ||
          mode.type === 'selectSetToSteal' ||
          mode.type === 'selectRentTarget';

        return (
          <div
            key={opp.id}
            className={`bg-gray-800 rounded-xl p-3 border transition-all ${
              isTarget ? 'border-yellow-500 cursor-pointer hover:border-yellow-400' : 'border-gray-700'
            }`}
            onClick={() => {
              if (mode.type === 'selectTarget') {
                if ((mode as any).actionType === 'debtCollector') {
                  onAction({ type: 'playDebtCollector', cardId: mode.cardId, targetPlayerId: opp.id });
                  resetMode();
                }
              }
              if (mode.type === 'selectRentTarget') {
                onAction({
                  type: 'playRent',
                  cardId: mode.cardId,
                  targetColor: mode.color,
                  targetPlayerId: opp.id,
                });
                resetMode();
              }
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm text-gray-200">{opp.name}</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">🃏 {opp.handCount}</span>
                <span className="text-yellow-400 font-bold">{completeSets}/3 sets</span>
              </div>
            </div>
            <BankArea cards={opp.bank} label="Bank" />
            <div className="mt-2">
              <PropertyArea
                sets={opp.properties}
                small
                onCardClick={
                  mode.type === 'selectPropertyToSteal'
                    ? (card, setColor) => {
                        const set = opp.properties.find(s => s.color === setColor);
                        if (set && isSetComplete(set)) return; // Can't steal from complete sets with sly deal
                        // Check if it's a sly deal or forced deal
                        const handCard = view.myHand.find(c => c.id === mode.cardId) as ActionCard;
                        if (handCard?.action === 'forcedDeal') {
                          // Need to select our card to offer
                          setMode({
                            type: 'selectMyPropertyToOffer',
                            cardId: mode.cardId,
                            targetPlayerId: opp.id,
                            targetCardId: card.id,
                          });
                        } else {
                          // Sly deal - just steal it
                          onAction({
                            type: 'playSlyDeal',
                            cardId: mode.cardId,
                            targetPlayerId: opp.id,
                            targetCardId: card.id,
                          });
                          resetMode();
                        }
                      }
                    : mode.type === 'selectSetToSteal'
                    ? (card, setColor) => {
                        const set = opp.properties.find(s => s.color === setColor);
                        if (set && isSetComplete(set)) {
                          onAction({
                            type: 'playDealBreaker',
                            cardId: mode.cardId,
                            targetPlayerId: opp.id,
                            targetColor: setColor as PropertyColor,
                          });
                          resetMode();
                        }
                      }
                    : undefined
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  // === Render payment selection ===
  const renderPaymentMode = () => {
    if (mode.type !== 'selectPayment') return null;

    const selectedValue = mode.selectedIds.reduce((sum, id) => {
      const bankCard = view.myBank.find(c => c.id === id);
      if (bankCard) return sum + bankCard.value;
      for (const set of view.myProperties) {
        const propCard = set.cards.find(c => c.id === id);
        if (propCard) return sum + propCard.value;
      }
      return sum;
    }, 0);

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl p-6 max-w-lg w-full mx-4">
          <h3 className="text-lg font-bold text-white mb-2">Select Payment</h3>
          <p className="text-gray-300 mb-4">
            Amount owed: <span className="text-red-400 font-bold">${mode.amount}M</span>
            {' | '}Selected: <span className={`font-bold ${selectedValue >= mode.amount ? 'text-green-400' : 'text-yellow-400'}`}>
              ${selectedValue}M
            </span>
          </p>

          <div className="mb-4">
            <div className="text-xs text-gray-400 mb-1">Click bank cards or properties to select:</div>
            <BankArea
              cards={view.myBank}
              selectedIds={mode.selectedIds}
              onCardClick={(card) => {
                const ids = mode.selectedIds.includes(card.id)
                  ? mode.selectedIds.filter(id => id !== card.id)
                  : [...mode.selectedIds, card.id];
                setMode({ ...mode, selectedIds: ids });
              }}
            />
            <div className="mt-2">
              <PropertyArea
                sets={view.myProperties}
                onCardClick={(card) => {
                  if (card.value === 0) return; // Can't pay with rainbow wildcards
                  const ids = mode.selectedIds.includes(card.id)
                    ? mode.selectedIds.filter(id => id !== card.id)
                    : [...mode.selectedIds, card.id];
                  setMode({ ...mode, selectedIds: ids });
                }}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                onAction({ type: 'respondPay', cardIds: mode.selectedIds });
                resetMode();
              }}
              disabled={selectedValue < mode.amount && (view.myBank.length > 0 || view.myProperties.some(s => s.cards.some(c => c.value > 0)))}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Pay ${selectedValue}M
            </button>
            {selectedValue === 0 && view.myBank.length === 0 && (
              <button
                onClick={() => {
                  onAction({ type: 'respondPay', cardIds: [] });
                  resetMode();
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Can&apos;t Pay
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // === Render pending action response ===
  const renderPendingResponse = () => {
    if (!needsResponse || !view.pendingAction) return null;

    const pa = view.pendingAction;
    const sourceName = playerNames[pa.sourcePlayerId] || pa.sourcePlayerId;

    let description = '';
    switch (pa.type) {
      case 'debtCollector':
        description = `${sourceName} demands $${pa.amount}M from you!`;
        break;
      case 'itIsMyBirthday':
        description = `${sourceName} says it's their birthday! Pay $${pa.amount}M.`;
        break;
      case 'rent':
        description = `${sourceName} charges you $${pa.amount}M rent!`;
        break;
      case 'slyDeal':
        description = `${sourceName} tries to steal one of your properties!`;
        break;
      case 'forcedDeal':
        description = `${sourceName} wants to force a trade with you!`;
        break;
      case 'dealBreaker':
        description = `${sourceName} tries to steal your ${pa.targetSetColor} set!`;
        break;
    }

    const hasJSN = view.myHand.some(c => c.type === 'action' && c.action === 'justSayNo');

    return (
      <div className="bg-red-900/50 border-2 border-red-500 rounded-xl p-4 mb-4 animate-pulse">
        <h3 className="text-lg font-bold text-red-300 mb-2">Action Against You!</h3>
        <p className="text-white mb-3">{description}</p>
        <div className="flex gap-2 flex-wrap">
          {hasJSN && (
            <button
              onClick={() => {
                const jsnCard = view.myHand.find(c => c.type === 'action' && c.action === 'justSayNo')!;
                onAction({ type: 'respondJustSayNo', cardId: jsnCard.id });
              }}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Just Say No!
            </button>
          )}
          {['debtCollector', 'itIsMyBirthday', 'rent'].includes(pa.type) && (
            <button
              onClick={() => {
                setMode({ type: 'selectPayment', amount: pa.amount || 0, selectedIds: [] });
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Pay ${pa.amount}M
            </button>
          )}
          {['slyDeal', 'forcedDeal', 'dealBreaker'].includes(pa.type) && (
            <button
              onClick={() => {
                onAction({ type: 'respondAccept' });
              }}
              className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Accept
            </button>
          )}
        </div>
      </div>
    );
  };

  // === Render color selection modal ===
  const renderColorSelect = () => {
    if (mode.type !== 'selectColor' && mode.type !== 'selectRentColor') return null;

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
          <h3 className="text-lg font-bold text-white mb-4">
            {mode.type === 'selectColor' ? 'Choose Color for Wildcard' : 'Choose Color for Rent'}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {mode.colors.map((color) => (
              <button
                key={color}
                onClick={() => {
                  if (mode.type === 'selectColor') {
                    onAction({ type: 'playProperty', cardId: mode.cardId, color });
                  } else {
                    const rentCard = view.myHand.find(c => c.id === mode.cardId) as RentCard;
                    if (rentCard.colors === 'all') {
                      setMode({ type: 'selectRentTarget', cardId: mode.cardId, color, isWild: true });
                      return;
                    }
                    onAction({ type: 'playRent', cardId: mode.cardId, targetColor: color });
                  }
                  resetMode();
                }}
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-600 hover:border-white transition-colors"
              >
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: COLOR_HEX[color] }} />
                <span className="text-white font-semibold">{COLOR_NAMES[color]}</span>
              </button>
            ))}
          </div>
          <button
            onClick={resetMode}
            className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  // === Render building placement selection ===
  const renderBuildingSelect = () => {
    if (mode.type !== 'selectSetForBuilding') return null;

    const eligible = view.myProperties.filter(s => {
      if (!isSetComplete(s)) return false;
      if (s.color === 'railroad' || s.color === 'utility') return false;
      if (mode.buildingType === 'house') return !s.house;
      return s.house && !s.hotel;
    });

    if (eligible.length === 0) {
      return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-bold text-white mb-2">No Eligible Sets</h3>
            <p className="text-gray-400 mb-4">
              No complete sets available for a {mode.buildingType}. You can bank this card instead.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onAction({ type: 'playCard', cardId: mode.cardId, asBank: true });
                  resetMode();
                }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold"
              >
                Bank It
              </button>
              <button onClick={resetMode} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl p-6 max-w-md mx-4">
          <h3 className="text-lg font-bold text-white mb-4">
            Place {mode.buildingType === 'house' ? 'House' : 'Hotel'} on which set?
          </h3>
          <div className="space-y-2">
            {eligible.map((set, i) => (
              <button
                key={i}
                onClick={() => {
                  onAction(
                    mode.buildingType === 'house'
                      ? { type: 'playHouse', cardId: mode.cardId, targetColor: set.color }
                      : { type: 'playHotel', cardId: mode.cardId, targetColor: set.color }
                  );
                  resetMode();
                }}
                className="w-full flex items-center gap-2 p-3 rounded-lg border border-gray-600 hover:border-white transition-colors"
              >
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: COLOR_HEX[set.color] }} />
                <span className="text-white font-semibold">{COLOR_NAMES[set.color]}</span>
              </button>
            ))}
          </div>
          <button onClick={resetMode} className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg">
            Cancel
          </button>
        </div>
      </div>
    );
  };

  // === Render confirm action modal ===
  const renderConfirmAction = () => {
    if (mode.type !== 'confirmAction') return null;
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl p-6 max-w-md mx-4">
          <h3 className="text-lg font-bold text-white mb-2">Confirm Action</h3>
          <p className="text-gray-300 mb-4">{mode.description}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onAction(mode.action);
                resetMode();
              }}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold"
            >
              Confirm
            </button>
            <button onClick={resetMode} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // === Render select-my-property for forced deal ===
  const renderSelectMyProperty = () => {
    if (mode.type !== 'selectMyPropertyToOffer') return null;

    const eligibleSets = view.myProperties.filter(s => !isSetComplete(s));

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl p-6 max-w-lg mx-4">
          <h3 className="text-lg font-bold text-white mb-2">Select Your Property to Trade</h3>
          <p className="text-gray-400 mb-4 text-sm">Choose one of your properties to offer in the forced deal.</p>
          <div className="space-y-2">
            {eligibleSets.map((set, i) => (
              <div key={i} className="flex gap-2 flex-wrap">
                {set.cards.map(card => (
                  <Card
                    key={card.id}
                    card={card}
                    small
                    onClick={() => {
                      onAction({
                        type: 'playForcedDeal',
                        cardId: mode.cardId,
                        targetPlayerId: mode.targetPlayerId,
                        targetCardId: mode.targetCardId,
                        offeredCardId: card.id,
                      });
                      resetMode();
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          <button onClick={resetMode} className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg">
            Cancel
          </button>
        </div>
      </div>
    );
  };

  // === Render rent target select for wild rent ===
  const renderRentTargetSelect = () => {
    if (mode.type !== 'selectRentTarget') return null;
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl p-6 max-w-md mx-4">
          <h3 className="text-lg font-bold text-white mb-4">Select Rent Target</h3>
          <div className="space-y-2">
            {view.opponents.map((opp) => (
              <button
                key={opp.id}
                onClick={() => {
                  onAction({
                    type: 'playRent',
                    cardId: mode.cardId,
                    targetColor: mode.color,
                    targetPlayerId: opp.id,
                  });
                  resetMode();
                }}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-600 hover:border-white transition-colors"
              >
                <span className="text-white font-semibold">{opp.name}</span>
                <span className="text-gray-400 text-sm">
                  Bank: ${opp.bank.reduce((s, c) => s + c.value, 0)}M
                </span>
              </button>
            ))}
          </div>
          <button onClick={resetMode} className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg">
            Cancel
          </button>
        </div>
      </div>
    );
  };

  // === Render game over ===
  if (view.winner) {
    const winnerName = view.winner === view.myId ? 'You' : playerNames[view.winner] || 'Unknown';
    const isPlayerWinner = view.winner === view.myId;
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center p-8 bg-gray-900 rounded-2xl border-2 border-yellow-500">
          <div className="text-6xl mb-4">{isPlayerWinner ? '🏆' : '😞'}</div>
          <h1 className="text-3xl font-bold text-yellow-400 mb-2">
            {isPlayerWinner ? 'You Win!' : `${winnerName} Wins!`}
          </h1>
          <p className="text-gray-400 mb-6">Game ended on turn {view.turnNumber}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-8 rounded-lg text-lg"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  // === Instruction text for current mode ===
  const getModeInstruction = () => {
    switch (mode.type) {
      case 'selectTarget': return 'Click an opponent to target';
      case 'selectPropertyToSteal': return 'Click a property from an opponent to steal (not from complete sets)';
      case 'selectSetToSteal': return 'Click a card in a COMPLETE set to steal the entire set';
      case 'selectRentTarget': return 'Click an opponent to charge rent';
      default: return null;
    }
  };

  const modeInstruction = getModeInstruction();
  const completeSets = view.myProperties.filter(isSetComplete).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      {/* Modals */}
      {renderColorSelect()}
      {renderPaymentMode()}
      {renderBuildingSelect()}
      {renderConfirmAction()}
      {renderSelectMyProperty()}
      {renderRentTargetSelect()}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-yellow-400">DealSmart</h1>
          <p className="text-xs text-gray-500">Monopoly Deal vs AI</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-gray-400">
            Turn <span className="text-white font-bold">{view.turnNumber}</span>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${
            isMyTurn ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
          }`}>
            {isMyTurn ? 'Your Turn' : `${playerNames[view.currentPlayerId]}'s Turn`}
          </div>
          {isMyTurn && (
            <div className="text-yellow-400 font-bold">
              {view.actionsRemaining} action{view.actionsRemaining !== 1 ? 's' : ''} left
            </div>
          )}
          <div className="text-gray-400">
            Draw pile: {view.drawPileCount}
          </div>
        </div>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="bg-blue-900/50 border border-blue-500 rounded-lg p-3 mb-4 flex items-center gap-2">
          <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full" />
          <span className="text-blue-300 text-sm">AI is thinking...</span>
        </div>
      )}

      {/* Mode instruction */}
      {modeInstruction && (
        <div className="bg-yellow-900/50 border border-yellow-500 rounded-lg p-3 mb-4 flex items-center justify-between">
          <span className="text-yellow-300 text-sm">{modeInstruction}</span>
          <button onClick={resetMode} className="text-yellow-400 hover:text-yellow-300 text-sm underline">Cancel</button>
        </div>
      )}

      {/* Pending action response */}
      {renderPendingResponse()}

      {/* Opponents */}
      {renderOpponents()}

      {/* Divider */}
      <div className="border-t border-gray-700 my-4" />

      {/* Your area */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">Your Board</h2>
            <span className={`text-sm font-bold ${completeSets >= 3 ? 'text-yellow-400' : 'text-gray-400'}`}>
              {completeSets}/3 complete sets
            </span>
          </div>
          {isMyTurn && view.phase === 'play' && (
            <button
              onClick={() => onAction({ type: 'endTurn' })}
              disabled={loading}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-1.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              End Turn
            </button>
          )}
        </div>

        {/* Bank and Properties side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <BankArea cards={view.myBank} label="Your Bank" />
          <PropertyArea
            sets={view.myProperties}
            label="Your Properties"
            onCardClick={
              mode.type === 'selectMyPropertyToOffer'
                ? (card) => {
                    onAction({
                      type: 'playForcedDeal',
                      cardId: mode.cardId,
                      targetPlayerId: mode.targetPlayerId,
                      targetCardId: mode.targetCardId,
                      offeredCardId: card.id,
                    });
                    resetMode();
                  }
                : undefined
            }
          />
        </div>

        {/* Hand */}
        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-400 uppercase mb-2">
            Your Hand ({view.myHand.length} cards)
            {view.phase === 'discard' && view.myHand.length > 7 && (
              <span className="text-red-400 ml-2">
                Discard {view.myHand.length - 7} card{view.myHand.length - 7 !== 1 ? 's' : ''}!
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {view.myHand.map((card) => (
              <Card
                key={card.id}
                card={card}
                onClick={() => {
                  if (view.phase === 'discard' && view.myHand.length > 7) {
                    onAction({ type: 'discard', cardIds: [card.id] });
                    return;
                  }
                  handleHandCardClick(card);
                }}
                selected={mode.type === 'selectDiscard' && mode.selectedIds.includes(card.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Game Log */}
      <div className="mt-4">
        <GameLog entries={view.log} playerNames={playerNames} />
      </div>
    </div>
  );
}
