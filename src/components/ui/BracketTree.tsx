'use client';

import React, { useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Trophy, Medal, Award, RefreshCw, Edit3, X, Check } from 'lucide-react';

export interface TournamentMatch {
  id: string;
  round: number;
  position: number;
  player1?: string | null;
  player2?: string | null;
  player1Id?: string | null;
  player2Id?: string | null;
  score1?: number | null;
  score2?: number | null;
  winner?: string | null;
  isLosersBracket?: boolean;
  isGrandFinals?: boolean;
}

export interface TournamentPair {
  id: string;
  matchId: string;
  nextMatchId?: string | null;
}

export interface BracketTreeProps {
  matches: TournamentMatch[];
  pairs?: TournamentPair[];
  onMatchClick?: (matchId: string, winnerTeamId: string, scoreA?: number, scoreB?: number) => void;
}

export function BracketTree({ matches, onMatchClick }: BracketTreeProps) {
  const hasDoubleElim = matches.some(m => m.isLosersBracket || m.isGrandFinals);
  const [activeTab, setActiveTab] = useState<'winners' | 'losers' | 'finals'>('winners');
  
  // Scoring / Editing Modal State
  const [activeMatchForScoring, setActiveMatchForScoring] = useState<TournamentMatch | null>(null);
  const [modalScore1, setModalScore1] = useState(11);
  const [modalScore2, setModalScore2] = useState(9);

  // Filter matches based on active tab if Double Elimination
  const filteredMatches = hasDoubleElim
    ? matches.filter(m => {
        if (activeTab === 'winners') return !m.isLosersBracket && !m.isGrandFinals;
        if (activeTab === 'losers') return !!m.isLosersBracket;
        if (activeTab === 'finals') return !!m.isGrandFinals;
        return true;
      })
    : matches;

  // Group matches by round for the active tab
  const rounds = filteredMatches.reduce((acc, match) => {
    if (!acc[match.round]) {
      acc[match.round] = [];
    }
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, TournamentMatch[]>);

  const roundNumbers = Object.keys(rounds)
    .map(Number)
    .sort((a, b) => a - b);

  const getRoundName = (roundNum: number, matchCount: number) => {
    if (activeTab === 'finals' || hasDoubleElim && roundNum > 100) return 'Grand Finals';
    if (activeTab === 'losers') {
      if (matchCount === 1) return 'Losers Finals';
      if (matchCount === 2) return 'Losers Semifinals';
      return `Losers R${roundNum}`;
    }
    if (matchCount === 1) return 'Championship';
    if (matchCount === 2) return 'Semifinals';
    if (matchCount >= 3 && matchCount <= 4) return 'Quarterfinals';
    return `Round of ${matchCount * 2}`;
  };

  // Determine champion and podium
  let champion: string | null = null;
  let secondPlace: string | null = null;
  let thirdPlace: string | null = null;

  if (hasDoubleElim) {
    // Grand Finals match
    const gfMatch = matches.find(m => m.isGrandFinals) || matches[matches.length - 1];
    if (gfMatch && gfMatch.winner) {
      champion = gfMatch.winner;
      secondPlace = gfMatch.winner === gfMatch.player1 ? gfMatch.player2 ?? null : gfMatch.player1 ?? null;
      
      // Third place is loser of Losers Finals
      const lbMatches = matches.filter(m => m.isLosersBracket);
      const maxLbRound = Math.max(0, ...lbMatches.map(m => m.round));
      const lbFinals = lbMatches.find(m => m.round === maxLbRound);
      if (lbFinals && lbFinals.winner) {
        thirdPlace = lbFinals.winner === lbFinals.player1 ? lbFinals.player2 ?? null : lbFinals.player1 ?? null;
      }
    }
  } else {
    // Single Elimination
    const maxRound = Math.max(0, ...matches.map(m => m.round));
    const finalsMatch = matches.find(m => m.round === maxRound);
    if (finalsMatch && finalsMatch.winner) {
      champion = finalsMatch.winner;
      secondPlace = finalsMatch.winner === finalsMatch.player1 ? finalsMatch.player2 ?? null : finalsMatch.player1 ?? null;
      
      // 3rd place from semis
      const semisMatches = matches.filter(m => m.round === maxRound - 1);
      if (semisMatches.length === 2 && semisMatches.every(m => m.winner)) {
        const losers = semisMatches.map(m => (m.winner === m.player1 ? m.player2 : m.player1)).filter(Boolean);
        if (losers.length > 0) thirdPlace = losers[0] ?? null;
      }
    }
  }

  const handleOpenScoreModal = (match: TournamentMatch) => {
    setActiveMatchForScoring(match);
    setModalScore1(match.score1 ?? 11);
    setModalScore2(match.score2 ?? 9);
  };

  const handleSwapModalScores = () => {
    const s1 = modalScore1;
    const s2 = modalScore2;
    setModalScore1(s2);
    setModalScore2(s1);
  };

  const handleSubmitModalScore = () => {
    if (!activeMatchForScoring || !onMatchClick) return;
    const isP1Winner = modalScore1 > modalScore2;
    const winnerId = isP1Winner ? activeMatchForScoring.player1Id : activeMatchForScoring.player2Id;
    if (winnerId) {
      onMatchClick(activeMatchForScoring.id, winnerId, modalScore1, modalScore2);
    }
    setActiveMatchForScoring(null);
  };

  if (matches.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 bg-white dark:bg-gray-900 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 text-gray-400">
        <p className="text-lg font-medium">No bracket matches generated yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* ─── Double Elimination Tabs ─── */}
      {hasDoubleElim && (
        <div className="flex items-center justify-center gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl max-w-md mx-auto w-full shadow-inner">
          <button
            onClick={() => setActiveTab('winners')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'winners'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <span>🏆</span>
            <span>Winners</span>
          </button>
          <button
            onClick={() => setActiveTab('losers')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'losers'
                ? 'bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <span>🔥</span>
            <span>Losers</span>
          </button>
          <button
            onClick={() => setActiveTab('finals')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'finals'
                ? 'bg-white dark:bg-gray-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <span>👑</span>
            <span>Finals</span>
          </button>
        </div>
      )}

      {/* ─── Podium Display ─── */}
      {champion && (
        <div className="flex justify-center items-end h-64 gap-2 md:gap-4 mb-4 mt-4 animate-slide-up">
          {/* 2nd Place */}
          {secondPlace && (
            <div className="flex flex-col items-center w-1/3 max-w-[180px]">
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-full shadow-md mb-2 text-center truncate w-full border border-gray-200 dark:border-gray-700">
                {secondPlace}
              </div>
              <div className="w-full h-32 bg-gradient-to-t from-slate-300 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-t-2xl flex justify-center pt-4 border-t-4 border-slate-400 shadow-lg relative">
                <span className="text-4xl font-black text-slate-400/40">2</span>
                <Medal className="text-slate-400 absolute -top-5" size={32} />
              </div>
            </div>
          )}

          {/* 1st Place */}
          <div className="flex flex-col items-center w-1/3 max-w-[200px] z-10 relative">
            <div className="text-sm md:text-base font-extrabold text-amber-900 dark:text-amber-200 bg-gradient-to-r from-yellow-200 to-yellow-100 dark:from-yellow-900/60 dark:to-amber-900/60 px-4 py-2 rounded-full shadow-md mb-2 text-center border border-yellow-300 dark:border-yellow-700 truncate w-full">
              {champion}
            </div>
            <div className="w-full h-44 bg-gradient-to-t from-yellow-500 to-yellow-400 dark:from-yellow-700 dark:to-yellow-600 rounded-t-2xl flex justify-center pt-4 border-t-4 border-yellow-300 shadow-xl relative overflow-hidden">
              <span className="text-6xl font-black text-yellow-600/30 dark:text-yellow-400/20">1</span>
              <Trophy className="text-yellow-300 absolute -top-6 drop-shadow-lg" size={40} />
            </div>
          </div>

          {/* 3rd Place */}
          {thirdPlace && (
            <div className="flex flex-col items-center w-1/3 max-w-[180px]">
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-full shadow-md mb-2 text-center truncate w-full border border-gray-200 dark:border-gray-700">
                {thirdPlace}
              </div>
              <div className="w-full h-24 bg-gradient-to-t from-amber-400 to-amber-300 dark:from-amber-900 dark:to-amber-800 rounded-t-2xl flex justify-center pt-4 border-t-4 border-amber-600 shadow-lg relative">
                <span className="text-4xl font-black text-amber-600/30">3</span>
                <Award className="text-amber-600 absolute -top-5" size={30} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Bracket Tree Canvas ─── */}
      <div className="w-full bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 min-h-[600px] relative shadow-sm">
        <TransformWrapper
          initialScale={1}
          minScale={0.1}
          maxScale={3}
          centerOnInit={true}
          smooth={false}
          wheel={{ step: 0.02 }}
          pinch={{ step: 2 }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Zoom Controls */}
              <div className="absolute bottom-4 right-4 z-40 flex gap-2 bg-white/90 dark:bg-gray-800/90 p-1.5 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 backdrop-blur-md">
                <button onClick={() => zoomOut()} className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Zoom Out">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button onClick={() => zoomIn()} className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Zoom In">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button onClick={() => resetTransform()} className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Reset View">
                  <RefreshCw size={18} />
                </button>
              </div>
              
              <TransformComponent wrapperClass="w-full h-full cursor-grab active:cursor-grabbing" contentClass="p-16">
                <div className="flex gap-16 min-h-[500px]">
                  {roundNumbers.map((round) => {
                    const roundMatches = rounds[round].sort((a, b) => a.position - b.position);

                    return (
                      <div key={round} className="flex flex-col justify-around min-w-[280px] relative">
                        <h3 className="absolute -top-10 w-full text-center text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                          {getRoundName(round, roundMatches.length)}
                        </h3>

                        <div className="flex flex-col justify-around h-full gap-8">
                          {roundMatches.map((match) => {
                            const hasWinner = !!match.winner;
                            const isP1Winner = match.winner === match.player1 && hasWinner;
                            const isP2Winner = match.winner === match.player2 && hasWinner;
                            const isPlayable = !!match.player1 && !!match.player2;

                            return (
                              <div key={match.id} className="relative flex items-center h-full">
                                {/* The Match Card */}
                                <div 
                                  onClick={() => {
                                    if (onMatchClick && isPlayable) {
                                      handleOpenScoreModal(match);
                                    }
                                  }}
                                  className={`w-full rounded-2xl shadow-sm overflow-hidden z-10 transition-all duration-200 border ${
                                    isPlayable ? 'cursor-pointer hover:ring-2 hover:ring-indigo-500/50' : 'opacity-70'
                                  } ${
                                    hasWinner 
                                      ? 'border-emerald-300 dark:border-emerald-700/80 bg-white dark:bg-gray-900' 
                                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-md'
                                  }`}
                                >
                                  {/* Top Bar with Match Number & Edit Action */}
                                  <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase">
                                    <span>Match #{match.position}</span>
                                    {isPlayable && onMatchClick && (
                                      <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline">
                                        <Edit3 size={11} /> {hasWinner ? 'Edit Score' : 'Score'}
                                      </span>
                                    )}
                                  </div>

                                  {/* Player 1 Row */}
                                  <div
                                    className={`px-4 py-3 flex justify-between items-center border-b border-gray-100 dark:border-gray-800 transition-colors ${
                                      isP1Winner 
                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-bold' 
                                        : hasWinner && !isP1Winner 
                                          ? 'text-gray-400 dark:text-gray-500 line-through' 
                                          : 'text-gray-900 dark:text-gray-100 font-bold'
                                    }`}
                                  >
                                    <span className="truncate mr-2 flex items-center gap-2">
                                      {isP1Winner && <span className="text-emerald-500 font-black">✓</span>}
                                      {match.player1 || <span className="text-gray-400 italic font-normal">TBD</span>}
                                    </span>
                                    <span className="font-mono font-black text-sm">{match.score1 ?? '-'}</span>
                                  </div>

                                  {/* Player 2 Row */}
                                  <div
                                    className={`px-4 py-3 flex justify-between items-center transition-colors ${
                                      isP2Winner 
                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-bold' 
                                        : hasWinner && !isP2Winner 
                                          ? 'text-gray-400 dark:text-gray-500 line-through' 
                                          : 'text-gray-900 dark:text-gray-100 font-bold'
                                    }`}
                                  >
                                    <span className="truncate mr-2 flex items-center gap-2">
                                      {isP2Winner && <span className="text-emerald-500 font-black">✓</span>}
                                      {match.player2 || <span className="text-gray-400 italic font-normal">TBD</span>}
                                    </span>
                                    <span className="font-mono font-black text-sm">{match.score2 ?? '-'}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>

      {/* ─── Match Score & Edit Dialog ─── */}
      {activeMatchForScoring && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">
                {activeMatchForScoring.winner ? 'Edit Match Score' : 'Enter Match Score'}
              </h3>
              <button onClick={() => setActiveMatchForScoring(null)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Team 1 Score Input */}
              <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate mr-2">
                  {activeMatchForScoring.player1}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setModalScore1(Math.max(0, modalScore1 - 1))} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center text-gray-700 dark:text-gray-200">-</button>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={modalScore1}
                    onChange={e => setModalScore1(parseInt(e.target.value) || 0)}
                    className="w-14 text-center font-black text-lg bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg py-1"
                  />
                  <button onClick={() => setModalScore1(modalScore1 + 1)} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center text-gray-700 dark:text-gray-200">+</button>
                </div>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleSwapModalScores}
                  className="px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-100 transition-colors shadow-sm"
                >
                  <RefreshCw size={12} /> Swap Scores / Winner
                </button>
              </div>

              {/* Team 2 Score Input */}
              <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate mr-2">
                  {activeMatchForScoring.player2}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setModalScore2(Math.max(0, modalScore2 - 1))} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center text-gray-700 dark:text-gray-200">-</button>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={modalScore2}
                    onChange={e => setModalScore2(parseInt(e.target.value) || 0)}
                    className="w-14 text-center font-black text-lg bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg py-1"
                  />
                  <button onClick={() => setModalScore2(modalScore2 + 1)} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center text-gray-700 dark:text-gray-200">+</button>
                </div>
              </div>
            </div>

            {/* Error or winner hint */}
            {modalScore1 === modalScore2 ? (
              <p className="text-xs text-rose-500 font-semibold text-center">Scores must differ to determine a winner.</p>
            ) : (
              <div className="text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                Winner: {modalScore1 > modalScore2 ? activeMatchForScoring.player1 : activeMatchForScoring.player2}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setActiveMatchForScoring(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitModalScore}
                disabled={modalScore1 === modalScore2}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                <Check size={16} /> Save Score
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
