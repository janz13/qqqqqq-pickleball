'use client';

import React from 'react';

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
}

export interface TournamentPair {
  id: string;
  matchId: string;
  nextMatchId?: string | null;
}

export interface BracketTreeProps {
  matches: TournamentMatch[];
  pairs?: TournamentPair[];
  onMatchClick?: (matchId: string, winnerTeamId: string) => void;
}

export function BracketTree({ matches, pairs, onMatchClick }: BracketTreeProps) {
  // Group matches by round
  const rounds = matches.reduce((acc, match) => {
    if (!acc[match.round]) {
      acc[match.round] = [];
    }
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, TournamentMatch[]>);

  const roundNumbers = Object.keys(rounds)
    .map(Number)
    .sort((a, b) => a - b);

  const getRoundName = (_idx: number, _roundNum: number, matchCount: number) => {
    if (matchCount === 1) return 'Finals';
    if (matchCount === 2) return 'Semifinals';
    if (matchCount >= 3 && matchCount <= 4) return 'Quarterfinals';
    return `Round of ${matchCount * 2}`;
  };

  // Determine if the entire tournament is complete (finals has a winner)
  const finalsRound = roundNumbers[roundNumbers.length - 1];
  const finalsMatches = finalsRound ? rounds[finalsRound] : [];
  const champion = finalsMatches.length === 1 && finalsMatches[0].winner ? finalsMatches[0].winner : null;

  if (matches.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
        <p className="text-lg font-medium">No bracket matches generated yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Champion Banner */}
      {champion && (
        <div className="relative overflow-hidden bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-400 rounded-2xl p-6 text-center shadow-lg animate-champion-entrance">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMikiLz48L3N2Zz4=')] opacity-50" />
          <div className="relative z-10">
            <div className="text-5xl mb-2 animate-bounce-slow">🏆</div>
            <h3 className="text-2xl font-black text-white drop-shadow-md tracking-tight">
              CHAMPION
            </h3>
            <p className="text-xl font-bold text-white/90 mt-1">{champion}</p>
          </div>
          {/* Confetti-like sparkle dots */}
          <div className="absolute top-2 left-6 w-2 h-2 bg-white rounded-full animate-sparkle-1" />
          <div className="absolute top-4 right-10 w-1.5 h-1.5 bg-white rounded-full animate-sparkle-2" />
          <div className="absolute bottom-3 left-16 w-1 h-1 bg-white rounded-full animate-sparkle-3" />
          <div className="absolute bottom-5 right-20 w-2 h-2 bg-yellow-200 rounded-full animate-sparkle-1" />
          <div className="absolute top-6 left-1/3 w-1.5 h-1.5 bg-yellow-100 rounded-full animate-sparkle-2" />
        </div>
      )}

      {/* Bracket Grid */}
      <div className="flex overflow-x-auto p-8 gap-12 bg-gray-50/30 rounded-xl min-h-[400px]">
        {roundNumbers.map((round, idx) => {
          const roundMatches = rounds[round].sort((a, b) => a.position - b.position);

          return (
            <div key={round} className="flex flex-col justify-around min-w-[260px] relative">
              <h3 className="absolute -top-6 w-full text-center text-xs font-bold text-gray-400 uppercase tracking-widest">
                {getRoundName(idx, round, roundMatches.length)}
              </h3>

              <div className="flex flex-col justify-around h-full gap-8">
                {roundMatches.map((match) => {
                  const isEven = match.position % 2 === 0;
                  const hasWinner = !!match.winner;
                  const isP1Winner = match.winner === match.player1 && hasWinner;
                  const isP2Winner = match.winner === match.player2 && hasWinner;
                  const isClickable = !!onMatchClick && !!match.player1 && !!match.player2 && !hasWinner;

                  return (
                    <div key={match.id} className="relative flex items-center h-full">
                      {/* The Match Card */}
                      <div className={`w-full rounded-lg shadow-sm overflow-hidden z-10 transition-all duration-300 ${
                        hasWinner 
                          ? 'border-2 border-emerald-300 shadow-emerald-100 shadow-md' 
                          : 'border border-gray-200 bg-white hover:shadow-md'
                      }`}>
                        {/* Player 1 Row */}
                        <div
                          onClick={() => {
                            if (isClickable) {
                              onMatchClick(match.id, match.player1Id!);
                            }
                          }}
                          className={`px-4 py-3 flex justify-between items-center border-b transition-all duration-300 ${
                            isClickable 
                              ? 'cursor-pointer hover:bg-indigo-50 active:bg-indigo-100 border-gray-100' 
                              : 'border-gray-100'
                          } ${
                            isP1Winner 
                              ? 'bg-emerald-50 font-bold text-emerald-800 animate-winner-flash' 
                              : hasWinner && !isP1Winner 
                                ? 'bg-gray-50 text-gray-400 line-through' 
                                : 'bg-white text-gray-700'
                          }`}
                        >
                          <span className="truncate mr-2 flex items-center gap-2">
                            {isP1Winner && <span className="text-emerald-500 animate-winner-check">✓</span>}
                            {match.player1 || <span className="text-gray-300 italic">TBD</span>}
                          </span>
                          <span className="text-sm font-medium opacity-80">{match.score1 ?? '-'}</span>
                        </div>

                        {/* Player 2 Row */}
                        <div
                          onClick={() => {
                            if (isClickable) {
                              onMatchClick(match.id, match.player2Id!);
                            }
                          }}
                          className={`px-4 py-3 flex justify-between items-center transition-all duration-300 ${
                            isClickable 
                              ? 'cursor-pointer hover:bg-indigo-50 active:bg-indigo-100' 
                              : ''
                          } ${
                            isP2Winner 
                              ? 'bg-emerald-50 font-bold text-emerald-800 animate-winner-flash' 
                              : hasWinner && !isP2Winner 
                                ? 'bg-gray-50 text-gray-400 line-through' 
                                : 'bg-white text-gray-700'
                          }`}
                        >
                          <span className="truncate mr-2 flex items-center gap-2">
                            {isP2Winner && <span className="text-emerald-500 animate-winner-check">✓</span>}
                            {match.player2 || <span className="text-gray-300 italic">TBD</span>}
                          </span>
                          <span className="text-sm font-medium opacity-80">{match.score2 ?? '-'}</span>
                        </div>
                      </div>

                      {/* Connecting lines for previous round */}
                      {idx > 0 && (
                        <div className="absolute left-0 w-6 border-b-2 border-gray-200 -translate-x-full top-1/2" />
                      )}

                      {/* Connecting lines to next round */}
                      {idx < roundNumbers.length - 1 && (
                        <div
                          className={`absolute right-0 w-6 border-r-2 border-gray-200 translate-x-full ${
                            isEven
                              ? 'top-1/2 h-[calc(50%+1rem)] border-t-2 rounded-tr-lg'
                              : 'bottom-1/2 h-[calc(50%+1rem)] border-b-2 rounded-br-lg'
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
