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

  const getRoundName = (idx: number, roundNum: number, matchCount: number) => {
    if (matchCount === 1) return 'Finals';
    if (matchCount === 2) return 'Semifinals';
    if (matchCount === 3 || matchCount === 4) return 'Quarterfinals';
    return `Round ${roundNum}`;
  };

  return (
    <div className="flex overflow-x-auto p-8 gap-12 bg-gray-50/30 rounded-xl min-h-[500px]">
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

                return (
                  <div key={match.id} className="relative flex items-center h-full">
                    {/* The Match Card */}
                    <div className="w-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden z-10 transition-shadow hover:shadow-md">
                      <div
                        onClick={() => {
                          if (onMatchClick && match.player1 && !match.winner && match.player2) {
                            onMatchClick(match.id, match.player1Id!);
                          }
                        }}
                        className={`px-4 py-3 flex justify-between items-center border-b border-gray-100 ${
                          match.player1 && !match.winner && match.player2 ? 'cursor-pointer hover:bg-indigo-50' : ''
                        } ${
                          match.winner === match.player1 && match.winner ? 'bg-indigo-50/50 font-semibold text-indigo-900' : 'text-gray-700'
                        }`}
                      >
                        <span className="truncate mr-2">{match.player1 || 'TBD'}</span>
                        <span className="text-sm font-medium opacity-80">{match.score1 ?? '-'}</span>
                      </div>
                      <div
                        onClick={() => {
                          if (onMatchClick && match.player2 && !match.winner && match.player1) {
                            onMatchClick(match.id, match.player2Id!);
                          }
                        }}
                        className={`px-4 py-3 flex justify-between items-center ${
                          match.player2 && !match.winner && match.player1 ? 'cursor-pointer hover:bg-indigo-50' : ''
                        } ${
                          match.winner === match.player2 && match.winner ? 'bg-indigo-50/50 font-semibold text-indigo-900' : 'text-gray-700'
                        }`}
                      >
                        <span className="truncate mr-2">{match.player2 || 'TBD'}</span>
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
  );
}
