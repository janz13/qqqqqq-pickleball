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

  return (
    <div className="space-y-4 animate-slide-up w-full max-w-4xl mx-auto">
      {rankedPairs.map((pair, index) => {
        let medal = null;
        if (index === 0 && (phase === 'COMPLETED' || phase === 'BRACKET')) medal = <Trophy size={18} className="text-yellow-500" />;
        else if (index === 1 && (phase === 'COMPLETED' || phase === 'BRACKET')) medal = <Medal size={18} className="text-slate-400" />;
        else if (index === 2 && (phase === 'COMPLETED' || phase === 'BRACKET')) medal = <Medal size={18} className="text-orange-500" />;
        
        return (
          <div key={pair.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              index === 0 ? 'bg-yellow-100 text-yellow-700' : 
              index === 1 ? 'bg-slate-100 text-slate-700' :
              index === 2 ? 'bg-orange-100 text-orange-700' :
              'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {index + 1}
            </div>
            
            <div className="flex-1">
              <div className="font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                {getTeamName(pair)}
                {medal}
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
  );
}
