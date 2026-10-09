'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { BracketTree } from '@/components/ui/BracketTree';

export default function TournamentPanel() {
  const { session, players } = useStore();
  const state = session?.tournamentState;

  if (!state) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-gray-500">
        <p>No active tournament state.</p>
      </div>
    );
  }

  const { phase, pairs, matches } = state;

  const handleStartPoolPlay = () => {
    // TODO: Implement starting pool play
  };

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return 'TBD';
    const pair = pairs.find(p => p.id === teamId);
    if (!pair) return 'Unknown';
    if (pair.name) return pair.name;
    const p1 = players.find(p => p.id === pair.player1Id);
    const p2 = players.find(p => p.id === pair.player2Id);
    if (p1 && p2) return `${p1.name} & ${p2.name}`;
    return 'Team ' + teamId;
  };

  const mappedBracketMatches = matches.map(m => {
    const p1Name = getTeamName(m.teamAId);
    const p2Name = getTeamName(m.teamBId);
    let winnerName = null;
    if (m.winnerTeamId) {
      winnerName = m.winnerTeamId === m.teamAId ? p1Name : p2Name;
    }

    return {
      id: m.id,
      round: m.round,
      position: m.matchNumber,
      player1: p1Name,
      player2: p2Name,
      score1: m.scoreA,
      score2: m.scoreB,
      winner: winnerName
    };
  });

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Tournament Management</h2>
        <div className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-semibold">
          Phase: {phase}
        </div>
      </div>

      {phase === 'REGISTRATION' && (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-200 gap-4">
          <p className="text-gray-600">Waiting for players to register for the tournament.</p>
          <button 
            onClick={handleStartPoolPlay}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
          >
            Start Pool Play
          </button>
        </div>
      )}

      {phase === 'POOL_PLAY' && (
        <div className="flex flex-col gap-4">
          <h3 className="text-xl font-semibold">Pool Play Matches</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.filter(m => m.round === 0).map(match => (
              <div key={match.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-500">Match {match.matchNumber}</span>
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded-md font-medium">{match.status}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="font-medium">{getTeamName(match.teamAId)}</span>
                  <span className="text-gray-400">{match.scoreA ?? '-'}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="font-medium">{getTeamName(match.teamBId)}</span>
                  <span className="text-gray-400">{match.scoreB ?? '-'}</span>
                </div>
              </div>
            ))}
            {matches.filter(m => m.round === 0).length === 0 && (
              <p className="text-gray-500">No pool matches scheduled yet.</p>
            )}
          </div>
        </div>
      )}

      {phase === 'BRACKET' && (
        <div className="flex flex-col gap-4">
          <h3 className="text-xl font-semibold">Bracket Phase</h3>
          <BracketTree matches={mappedBracketMatches} />
        </div>
      )}
      
      {phase === 'COMPLETED' && (
        <div className="flex flex-col gap-4">
          <h3 className="text-xl font-semibold">Tournament Completed</h3>
          <BracketTree matches={mappedBracketMatches} />
        </div>
      )}
    </div>
  );
}
