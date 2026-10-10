import React from 'react';
import { TournamentState, Player } from '@/types/models';
import { Trophy, Medal } from 'lucide-react';

export function TournamentLeaderboard({ tournamentState, players }: { tournamentState: TournamentState, players: Player[] }) {
  if (!tournamentState || tournamentState.pairs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Trophy size={48} className="mb-4 opacity-20" />
        <p className="font-medium">Tournament not started yet</p>
      </div>
    );
  }

  const getTeamName = (pair: any) => {
    if (pair.name) return pair.name;
    const p1 = players.find(p => p.id === pair.player1Id);
    const p2 = players.find(p => p.id === pair.player2Id);
    if (p1 && p2) return `${p1.name} & ${p2.name}`;
    if (p1) return p1.name;
    if (p2) return p2.name;
    return `Team`;
  };

  const getTeamInitials = (pair: any) => {
    if (pair.name) return pair.name.substring(0, 2).toUpperCase();
    const p1 = players.find(p => p.id === pair.player1Id);
    const p2 = players.find(p => p.id === pair.player2Id);
    if (p1 && p2) return `${p1.name.charAt(0)}${p2.name.charAt(0)}`.toUpperCase();
    if (p1) return p1.name.substring(0, 2).toUpperCase();
    return `T`;
  };

  const { pairs, matches, phase } = tournamentState;

  // Rank teams based on tournament performance
  const rankedPairs = [...pairs].sort((a, b) => {
    // 1. Bracket progress
    const aBracketMatches = matches.filter(m => !m.id.startsWith('pool') && (m.teamAId === a.id || m.teamBId === a.id));
    const bBracketMatches = matches.filter(m => !m.id.startsWith('pool') && (m.teamAId === b.id || m.teamBId === b.id));
    
    const aMaxRound = Math.max(...aBracketMatches.map(m => m.round), 0);
    const bMaxRound = Math.max(...bBracketMatches.map(m => m.round), 0);
    
    const aWonMax = aBracketMatches.some(m => m.round === aMaxRound && m.winnerTeamId === a.id);
    const bWonMax = bBracketMatches.some(m => m.round === bMaxRound && m.winnerTeamId === b.id);
    
    // Assign a score: reaching a round gives points, winning that round gives a bonus
    const aBracketScore = aMaxRound * 10 + (aWonMax ? 5 : 0);
    const bBracketScore = bMaxRound * 10 + (bWonMax ? 5 : 0);
    
    if (aBracketScore !== bBracketScore) return bBracketScore - aBracketScore;
    
    // 2. Pool Play Wins
    if (a.poolPlayWins !== b.poolPlayWins) return b.poolPlayWins - a.poolPlayWins;
    
    // 3. Pool Play Point Diff
    return b.poolPlayPointDiff - a.poolPlayPointDiff;
  });

  const top3 = rankedPairs.slice(0, 3);
  const others = rankedPairs.slice(3);

  return (
    <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto animate-slide-up">
      {top3.length > 0 && (
        <div className="flex justify-center items-end gap-3 sm:gap-6 h-56 px-4 mt-6">
          {/* Second Place */}
          {top3[1] && (
            <div className="flex flex-col items-center flex-1 max-w-[140px] animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <div className="bg-white dark:bg-gray-900 w-full pt-4 pb-2 px-2 flex flex-col items-center rounded-t-3xl border border-gray-200 dark:border-gray-800 border-b-0 translate-y-2 relative shadow-sm">
                <Medal className="text-slate-400 absolute -top-5 drop-shadow-md" size={32} />
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-slate-400 to-slate-500 text-white flex items-center justify-center font-bold text-sm shadow-md mb-2 overflow-hidden">
                  {getTeamInitials(top3[1])}
                </div>
                <div className="font-bold text-center text-sm truncate w-full text-gray-900 dark:text-gray-100">{getTeamName(top3[1])}</div>
                <div className="text-xs font-semibold text-slate-500">
                  {top3[1].poolPlayWins}W ({top3[1].poolPlayPointDiff > 0 ? '+' : ''}{top3[1].poolPlayPointDiff})
                </div>
              </div>
              <div className="w-full h-24 bg-gradient-to-t from-slate-300 to-slate-200 dark:from-slate-700 dark:to-slate-600 rounded-t-xl flex justify-center pt-3 shadow-inner">
                <span className="text-3xl font-black text-slate-400/50 dark:text-slate-500/50">2</span>
              </div>
            </div>
          )}

          {/* First Place */}
          {top3[0] && (
            <div className="flex flex-col items-center flex-1 max-w-[160px] z-10 animate-slide-up">
              <div className="bg-white dark:bg-gray-900 w-full pt-5 pb-3 px-2 flex flex-col items-center rounded-t-3xl border border-gray-200 dark:border-gray-800 border-b-0 translate-y-2 relative shadow-md">
                <Trophy className="text-yellow-500 absolute -top-6 drop-shadow-lg" size={40} />
                <div className="w-14 h-14 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-lg mb-2 overflow-hidden ring-4 ring-yellow-50 dark:ring-yellow-900/30">
                  {getTeamInitials(top3[0])}
                </div>
                <div className="font-black text-center text-base truncate w-full text-gray-900 dark:text-gray-100">{getTeamName(top3[0])}</div>
                <div className="text-sm font-bold text-amber-600 dark:text-amber-500">
                  {top3[0].poolPlayWins}W ({top3[0].poolPlayPointDiff > 0 ? '+' : ''}{top3[0].poolPlayPointDiff})
                </div>
              </div>
              <div className="w-full h-32 bg-gradient-to-t from-yellow-300 to-yellow-200 dark:from-yellow-700 dark:to-yellow-600 rounded-t-xl flex justify-center pt-3 shadow-inner">
                <span className="text-4xl font-black text-yellow-500/50 dark:text-yellow-500/30">1</span>
              </div>
            </div>
          )}

          {/* Third Place */}
          {top3[2] && (
            <div className="flex flex-col items-center flex-1 max-w-[140px] animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <div className="bg-white dark:bg-gray-900 w-full pt-4 pb-2 px-2 flex flex-col items-center rounded-t-3xl border border-gray-200 dark:border-gray-800 border-b-0 translate-y-2 relative shadow-sm">
                <Medal className="text-orange-400 absolute -top-5 drop-shadow-md" size={32} />
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-300 to-orange-400 text-white flex items-center justify-center font-bold text-sm shadow-md mb-2 overflow-hidden">
                  {getTeamInitials(top3[2])}
                </div>
                <div className="font-bold text-center text-sm truncate w-full text-gray-900 dark:text-gray-100">{getTeamName(top3[2])}</div>
                <div className="text-xs font-semibold text-slate-500">
                  {top3[2].poolPlayWins}W ({top3[2].poolPlayPointDiff > 0 ? '+' : ''}{top3[2].poolPlayPointDiff})
                </div>
              </div>
              <div className="w-full h-20 bg-gradient-to-t from-orange-200 to-orange-100 dark:from-orange-900/60 dark:to-orange-800/60 rounded-t-xl flex justify-center pt-3 shadow-inner">
                <span className="text-3xl font-black text-orange-400/50 dark:text-orange-500/30">3</span>
              </div>
            </div>
          )}
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-3 mt-4">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider pl-2">Other Teams</h3>
          {others.map((pair, idx) => {
            const index = idx + 3;
            return (
              <div key={pair.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  {index + 1}
                </div>
                
                <div className="flex-1">
                  <div className="font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    {getTeamName(pair)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex gap-3">
                    <span>{pair.poolPlayWins}W - {pair.poolPlayPointsScored} Pts</span>
                    <span className={pair.poolPlayPointDiff > 0 ? 'text-emerald-500' : pair.poolPlayPointDiff < 0 ? 'text-rose-500' : ''}>
                      Diff: {pair.poolPlayPointDiff > 0 ? '+' : ''}{pair.poolPlayPointDiff}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
