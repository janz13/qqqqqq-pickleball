'use client';

import React, { useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Trophy, Medal, Award, RefreshCw, Edit3, X, Check, Flame, Crown, ArrowDown, Layout, Shield } from 'lucide-react';

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
  isBestOf3?: boolean;
  games?: { winnerId: string; scoreA: number; scoreB: number }[];
  is3rdPlaceMatch?: boolean;
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

interface RoundConnectorProps {
  currentCount: number;
  nextCount: number;
}

function RoundConnector({ currentCount, nextCount }: RoundConnectorProps) {
  const isHalving = currentCount === nextCount * 2;
  const isSame = currentCount === nextCount;

  return (
    <div className="flex flex-col w-10 sm:w-12 shrink-0 select-none pointer-events-none">
      {/* Spacer matching the round title h3 */}
      <div className="text-center text-xs font-black uppercase tracking-widest mb-4 invisible">
        &nbsp;
      </div>
      {/* Connector lines spanning the match list height */}
      <div className="h-full relative w-full">
        <svg
          className="w-full h-full text-gray-400 dark:text-gray-600 overflow-visible"
          viewBox="0 0 40 100"
          preserveAspectRatio="none"
        >
          {isHalving ? (
            Array.from({ length: nextCount }).map((_, j) => {
              const yA = ((2 * j + 0.5) / currentCount) * 100;
              const yB = ((2 * j + 1.5) / currentCount) * 100;
              const yMid = ((j + 0.5) / nextCount) * 100;
              return (
                <path
                  key={j}
                  d={`M 0 ${yA} H 20 V ${yB} H 0 M 20 ${yMid} H 40`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })
          ) : isSame ? (
            Array.from({ length: nextCount }).map((_, j) => {
              const y = ((j + 0.5) / nextCount) * 100;
              return (
                <path
                  key={j}
                  d={`M 0 ${y} H 40`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })
          ) : (
            Array.from({ length: nextCount }).map((_, j) => {
              const parentIdx = Math.min(Math.floor((j * currentCount) / nextCount), currentCount - 1);
              const yCurrent = ((parentIdx + 0.5) / currentCount) * 100;
              const yNext = ((j + 0.5) / nextCount) * 100;
              return (
                <path
                  key={j}
                  d={`M 0 ${yCurrent} H 20 V ${yNext} H 40`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })
          )}
        </svg>
      </div>
    </div>
  );
}

export function BracketTree({ matches, onMatchClick }: BracketTreeProps) {
  const hasDoubleElim = matches.some(m => m.isLosersBracket || m.isGrandFinals);
  
  // Default to 'all' for Liquipedia Main Event view!
  const [viewMode, setViewMode] = useState<'all' | 'winners' | 'losers' | 'finals'>('all');
  
  // Scoring / Editing Modal State
  const [activeMatchForScoring, setActiveMatchForScoring] = useState<TournamentMatch | null>(null);
  const [modalScore1, setModalScore1] = useState(11);
  const [modalScore2, setModalScore2] = useState(9);

  // Separate matches into Upper Bracket, Lower Bracket, Grand Finals, and 3rd Place Match
  const upperMatches = matches.filter(m => !m.isLosersBracket && !m.isGrandFinals && !m.is3rdPlaceMatch);
  const lowerMatches = matches.filter(m => !!m.isLosersBracket);
  const finalsMatches = matches.filter(m => !!m.isGrandFinals);
  const grandFinalMatch = finalsMatches[0] || matches[matches.length - 1];
  const thirdPlaceMatch = matches.find(m => !!m.is3rdPlaceMatch);

  // Group Upper Bracket by round
  const upperRounds = upperMatches.reduce((acc, match) => {
    if (!acc[match.round]) acc[match.round] = [];
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, TournamentMatch[]>);
  const upperRoundNums = Object.keys(upperRounds).map(Number).sort((a, b) => a - b);

  // Group Lower Bracket by round
  const lowerRounds = lowerMatches.reduce((acc, match) => {
    if (!acc[match.round]) acc[match.round] = [];
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, TournamentMatch[]>);
  const lowerRoundNums = Object.keys(lowerRounds).map(Number).sort((a, b) => a - b);

  // Helper for Round Titles (Liquipedia style)
  const getUpperRoundTitle = (roundNum: number, matchCount: number) => {
    if (matchCount === 1) return hasDoubleElim ? 'Upper Bracket Final' : 'Final';
    if (matchCount === 2) return hasDoubleElim ? 'Upper Bracket Semifinals' : 'Semifinals';
    if (matchCount === 4) return hasDoubleElim ? 'Upper Bracket Quarterfinals' : 'Quarterfinals';
    return hasDoubleElim ? `Upper Bracket Round ${roundNum}` : `Round ${roundNum}`;
  };

  const getLowerRoundTitle = (roundNum: number, matchCount: number, totalRounds: number) => {
    if (roundNum === totalRounds) return 'Lower Bracket Final';
    if (roundNum === totalRounds - 1 && matchCount === 1) return 'Lower Bracket Semifinal';
    if (matchCount === 2) return `Lower Bracket Round ${roundNum}`;
    return `Lower Bracket Round ${roundNum}`;
  };

  // Determine champion and podium
  let champion: string | null = null;
  let secondPlace: string | null = null;
  let thirdPlace: string | null = null;
  let fourthPlace: string | null = null;

  if (hasDoubleElim) {
    if (grandFinalMatch && grandFinalMatch.winner) {
      champion = grandFinalMatch.winner;
      secondPlace = grandFinalMatch.winner === grandFinalMatch.player1 ? grandFinalMatch.player2 ?? null : grandFinalMatch.player1 ?? null;
      
      // Third place is loser of Lower Bracket Final
      const maxLbRound = Math.max(0, ...lowerMatches.map(m => m.round));
      const lbFinals = lowerMatches.find(m => m.round === maxLbRound);
      if (lbFinals && lbFinals.winner) {
        thirdPlace = lbFinals.winner === lbFinals.player1 ? lbFinals.player2 ?? null : lbFinals.player1 ?? null;
      }

      // Fourth place is loser of Lower Bracket Semifinal
      const lbSemis = lowerMatches.find(m => m.round === maxLbRound - 1);
      if (lbSemis && lbSemis.winner) {
        fourthPlace = lbSemis.winner === lbSemis.player1 ? lbSemis.player2 ?? null : lbSemis.player1 ?? null;
      }
    }
  } else {
    // Single Elimination
    const maxRound = Math.max(0, ...matches.map(m => m.round));
    const finalsMatch = matches.find(m => m.round === maxRound && !m.is3rdPlaceMatch);
    if (finalsMatch && finalsMatch.winner) {
      champion = finalsMatch.winner;
      secondPlace = finalsMatch.winner === finalsMatch.player1 ? finalsMatch.player2 ?? null : finalsMatch.player1 ?? null;
    }
    if (thirdPlaceMatch && thirdPlaceMatch.winner) {
      thirdPlace = thirdPlaceMatch.winner;
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

  // Liquipedia Match Card Component
  const renderLiquipediaMatchCard = (match: TournamentMatch, bracketType: 'upper' | 'lower' | 'final') => {
    const hasWinner = !!match.winner;
    const isP1Winner = match.winner === match.player1 && hasWinner;
    const isP2Winner = match.winner === match.player2 && hasWinner;
    const isPlayable = !!match.player1 && !!match.player2;

    const gamesPlayed = match.games?.length ?? 0;
    const p1GameWins = match.games?.filter(g => g.winnerId === match.player1Id).length ?? 0;
    const p2GameWins = match.games?.filter(g => g.winnerId === match.player2Id).length ?? 0;

    return (
      <div key={match.id} className="relative flex items-center h-full">
        <div
          onClick={() => {
            if (onMatchClick && isPlayable) {
              handleOpenScoreModal(match);
            }
          }}
          className={`w-[270px] rounded-xl overflow-hidden shadow-sm transition-all duration-200 border ${
            onMatchClick && isPlayable
              ? 'cursor-pointer hover:ring-2 hover:ring-indigo-500/40 hover:scale-[1.01]'
              : isPlayable
                ? 'cursor-default'
                : 'opacity-70 cursor-default'
          } ${
            hasWinner
              ? 'border-emerald-300 dark:border-emerald-700/80 bg-white dark:bg-gray-900'
              : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
          }`}
        >
          {/* Liquipedia Style Header */}
          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center text-[10px] font-bold text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5 uppercase tracking-wider font-extrabold">
              {bracketType === 'upper' && <Trophy size={11} className="text-indigo-500" />}
              {bracketType === 'lower' && <Flame size={11} className="text-amber-500" />}
              {bracketType === 'final' && <Crown size={11} className="text-emerald-500" />}
              Match #{match.position}
              {match.isBestOf3 && (
                <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-black uppercase">
                  ⚔️ Bo3
                </span>
              )}
            </span>
            {match.is3rdPlaceMatch ? (
              <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">
                3rd Place
              </span>
            ) : bracketType === 'upper' && hasDoubleElim ? (
              <span className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                <ArrowDown size={10} /> To LB
              </span>
            ) : null}
            {bracketType === 'lower' && (
              <span className="text-[9px] text-rose-500 font-semibold">
                Elimination
              </span>
            )}
            {bracketType === 'final' && (
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                Championship
              </span>
            )}
          </div>

          {/* Best-of-3 Series Standing */}
          {match.isBestOf3 && gamesPlayed > 0 && (
            <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/30 text-[10px] font-black text-center text-indigo-700 dark:text-indigo-300 border-b border-gray-100 dark:border-gray-800">
              Series: {p1GameWins}-{p2GameWins}
            </div>
          )}

          {/* Opponent 1 Row */}
          <div
            className={`px-3 py-2.5 flex justify-between items-center border-b border-gray-100 dark:border-gray-800 transition-colors ${
              isP1Winner
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-black'
                : hasWinner && !isP1Winner
                  ? 'text-gray-400 dark:text-gray-500 line-through'
                  : 'text-gray-900 dark:text-gray-100 font-bold'
            }`}
          >
            <span className="truncate mr-2 flex items-center gap-2 text-xs">
              {isP1Winner && <span className="text-emerald-500 font-black">✓</span>}
              {match.player1 || <span className="text-gray-400 italic font-normal">TBD</span>}
            </span>
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs ${
              isP1Winner
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
            }`}>
              {match.score1 ?? '-'}
            </span>
          </div>

          {/* Opponent 2 Row */}
          <div
            className={`px-3 py-2.5 flex justify-between items-center transition-colors ${
              isP2Winner
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-black'
                : hasWinner && !isP2Winner
                  ? 'text-gray-400 dark:text-gray-500 line-through'
                  : 'text-gray-900 dark:text-gray-100 font-bold'
            }`}
          >
            <span className="truncate mr-2 flex items-center gap-2 text-xs">
              {isP2Winner && <span className="text-emerald-500 font-black">✓</span>}
              {match.player2 || <span className="text-gray-400 italic font-normal">TBD</span>}
            </span>
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs ${
              isP2Winner
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
            }`}>
              {match.score2 ?? '-'}
            </span>
          </div>
        </div>
      </div>
    );
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
      {/* ─── Liquipedia Navigation Controls ─── */}
      {hasDoubleElim && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl shadow-inner">
            <button
              onClick={() => setViewMode('all')}
              className={`py-2 px-3.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                viewMode === 'all'
                  ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Layout size={14} /> Full Lineup (TI Format)
            </button>
            <button
              onClick={() => setViewMode('winners')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'winners'
                  ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Trophy size={14} /> Upper Bracket
            </button>
            <button
              onClick={() => setViewMode('losers')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'losers'
                  ? 'bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Flame size={14} /> Lower Bracket
            </button>
            <button
              onClick={() => setViewMode('finals')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'finals'
                  ? 'bg-white dark:bg-gray-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Crown size={14} /> Grand Finals
            </button>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium hidden sm:inline">
            Scroll or pinch to zoom • Drag to pan
          </span>
        </div>
      )}

      {/* ─── Podium Display ─── */}
      {champion && (
        <div className="flex justify-center items-end h-64 gap-2 md:gap-4 mb-2 mt-2 animate-slide-up">
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

          <div className="flex flex-col items-center w-1/3 max-w-[200px] z-10 relative">
            <div className="text-sm md:text-base font-extrabold text-amber-900 dark:text-amber-200 bg-gradient-to-r from-yellow-200 to-yellow-100 dark:from-yellow-900/60 dark:to-amber-900/60 px-4 py-2 rounded-full shadow-md mb-2 text-center border border-yellow-300 dark:border-yellow-700 truncate w-full">
              {champion}
            </div>
            <div className="w-full h-44 bg-gradient-to-t from-yellow-500 to-yellow-400 dark:from-yellow-700 dark:to-yellow-600 rounded-t-2xl flex justify-center pt-4 border-t-4 border-yellow-300 shadow-xl relative overflow-hidden">
              <span className="text-6xl font-black text-yellow-600/30 dark:text-yellow-400/20">1</span>
              <Trophy className="text-yellow-300 absolute -top-6 drop-shadow-lg" size={40} />
            </div>
          </div>

          {thirdPlace && (
            <div className="flex flex-col items-center w-1/3 max-w-[220px]">
              <div
                className="text-sm font-bold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-full shadow-md mb-2 text-center truncate w-full border border-gray-200 dark:border-gray-700"
                title={thirdPlace}
              >
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

      {/* ─── Liquipedia Canvas ─── */}
      <div className="w-full bg-white dark:bg-gray-950 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 min-h-[650px] relative shadow-sm">
        <TransformWrapper
          initialScale={0.85}
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
              <div className="absolute bottom-4 right-4 z-40 flex gap-2 bg-white/90 dark:bg-gray-900/90 p-1.5 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 backdrop-blur-md">
                <button onClick={() => zoomOut()} className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Zoom Out">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button onClick={() => zoomIn()} className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Zoom In">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button onClick={() => resetTransform()} className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Reset View">
                  <RefreshCw size={18} />
                </button>
              </div>
              
              <TransformComponent wrapperClass="w-full h-full cursor-grab active:cursor-grabbing" contentClass="p-16">
                <div className="flex gap-16 min-h-[600px] items-start">
                  
                  {/* Left Column: Upper & Lower Bracket Stacks (Liquipedia Format) */}
                  <div className="flex flex-col gap-16">
                    
                    {/* ─── UPPER BRACKET (TOP) ─── */}
                    {(viewMode === 'all' || viewMode === 'winners') && upperRoundNums.length > 0 && (
                      <div className="space-y-6">
                        <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-800 text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                          <Trophy size={16} /> {hasDoubleElim ? 'Upper Bracket (Double Elimination)' : 'Championship Bracket'}
                        </div>

                        <div className="flex items-stretch">
                          {upperRoundNums.map((round, rIndex) => {
                            const roundMatches = upperRounds[round].sort((a, b) => a.position - b.position);
                            const hasNext = rIndex < upperRoundNums.length - 1;
                            const nextRound = hasNext ? upperRoundNums[rIndex + 1] : null;
                            const nextRoundMatches = nextRound ? upperRounds[nextRound] : null;

                            return (
                              <React.Fragment key={`ub_${round}`}>
                                <div className="flex flex-col justify-around min-w-[270px] relative">
                                  <h3 className="text-center text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">
                                    {getUpperRoundTitle(round, roundMatches.length)}
                                  </h3>
                                  <div className="flex flex-col justify-around h-full gap-8">
                                    {roundMatches.map(m => renderLiquipediaMatchCard(m, 'upper'))}
                                  </div>
                                </div>

                                {hasNext && nextRoundMatches && (
                                  <RoundConnector
                                    currentCount={roundMatches.length}
                                    nextCount={nextRoundMatches.length}
                                  />
                                )}
                              </React.Fragment>
                            );
                          })}

                          {/* 3rd Place Match — beside the Finals */}
                          {!hasDoubleElim && thirdPlaceMatch && (
                            <div className="flex flex-col justify-end min-w-[270px] relative ml-6">
                              <h3 className="text-center text-xs font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest mb-4">
                                🥉 3rd Place Match
                              </h3>
                              <div className="bg-gradient-to-b from-amber-50/50 to-transparent dark:from-amber-950/20 p-2 rounded-2xl border border-amber-300/40 dark:border-amber-800/40">
                                {renderLiquipediaMatchCard(thirdPlaceMatch, 'upper')}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ─── LOWER BRACKET (BOTTOM) ─── */}
                    {(viewMode === 'all' || viewMode === 'losers') && lowerRoundNums.length > 0 && (
                      <div className="space-y-6 pt-4 border-t-2 border-gray-200 dark:border-gray-800">
                        <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-800 text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                          <Flame size={16} /> Lower Bracket (Survival & Elimination)
                        </div>

                        <div className="flex items-stretch">
                          {lowerRoundNums.map((round, rIndex) => {
                            const roundMatches = lowerRounds[round].sort((a, b) => a.position - b.position);
                            const hasNext = rIndex < lowerRoundNums.length - 1;
                            const nextRound = hasNext ? lowerRoundNums[rIndex + 1] : null;
                            const nextRoundMatches = nextRound ? lowerRounds[nextRound] : null;

                            return (
                              <React.Fragment key={`lb_${round}`}>
                                <div className="flex flex-col justify-around min-w-[270px] relative">
                                  <h3 className="text-center text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">
                                    {getLowerRoundTitle(round, roundMatches.length, lowerRoundNums.length)}
                                  </h3>
                                  <div className="flex flex-col justify-around h-full gap-8">
                                    {roundMatches.map(m => renderLiquipediaMatchCard(m, 'lower'))}
                                  </div>
                                </div>

                                {hasNext && nextRoundMatches && (
                                  <RoundConnector
                                    currentCount={roundMatches.length}
                                    nextCount={nextRoundMatches.length}
                                  />
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ─── RIGHT COLUMN: GRAND FINALS ─── */}
                  {hasDoubleElim && (viewMode === 'all' || viewMode === 'finals') && grandFinalMatch && (
                    <div className="flex flex-col justify-center items-center min-h-[500px] pl-12 border-l-2 border-dashed border-gray-200 dark:border-gray-800 self-center">
                      <div className="space-y-6 text-center">
                        <div className="flex items-center justify-center gap-2 pb-2 text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                          <Crown size={18} /> Grand Finals
                        </div>
                        <div className="bg-gradient-to-b from-amber-50 to-emerald-50 dark:from-amber-950/20 dark:to-emerald-950/20 p-2 rounded-2xl border border-emerald-300 dark:border-emerald-800 shadow-xl">
                          {renderLiquipediaMatchCard(grandFinalMatch, 'final')}
                        </div>
                        <p className="text-[11px] font-bold text-gray-400 max-w-[240px]">
                          Upper Bracket Winner meets Lower Bracket Winner for the Championship Title!
                        </p>
                      </div>
                    </div>
                  )}

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
