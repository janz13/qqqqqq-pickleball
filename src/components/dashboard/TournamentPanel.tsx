'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { BracketTree } from '@/components/ui/BracketTree';
import { SessionType } from '@/types/models';

export default function TournamentPanel() {
  const { session, players } = useStore();
  const state = session?.tournamentState;
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // ─── No tournament state yet → Setup screen ───
  if (!state) {
    const canStart = session?.sessionType && session.sessionType !== 'OPEN_PLAY';
    
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-gray-500 gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">Tournament Setup</h2>
          <p>Make sure all players have been added and checked in through the Roster tab before starting.</p>
          <p className="text-sm text-gray-400 mt-2">
            {players.length} player{players.length !== 1 ? 's' : ''} registered 
            ({players.filter(p => p.status !== 'CHECKED_OUT').length} checked in)
          </p>
        </div>
        
        {canStart ? (
          <>
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
              <button 
                onClick={() => useStore.getState().startTournament('RANDOM')}
                disabled={players.filter(p => p.status !== 'CHECKED_OUT').length < 4}
                className="flex-1 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-xl font-bold transition-colors shadow-sm flex flex-col items-center justify-center gap-1"
              >
                <span>🎲 Random Pairs</span>
                <span className="text-xs font-normal opacity-80">Shuffle all players</span>
              </button>
              <button 
                onClick={() => useStore.getState().startTournament('LOCKED')}
                disabled={players.filter(p => p.status !== 'CHECKED_OUT').length < 4}
                className="flex-1 px-6 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded-xl font-bold transition-colors shadow-sm flex flex-col items-center justify-center gap-1"
              >
                <span>🔗 Custom Pairs</span>
                <span className="text-xs font-normal opacity-80">Use Duo Queue locks</span>
              </button>
            </div>
            {players.filter(p => p.status !== 'CHECKED_OUT').length < 4 && (
              <p className="text-sm text-red-500 font-medium mt-2">Need at least 4 checked-in players</p>
            )}
          </>
        ) : (
          <p className="text-red-500 font-medium">This session is set to Open Play, not a tournament mode.</p>
        )}
      </div>
    );
  }

  const { phase, pairs, matches } = state;

  // ─── Helper: get team display name ───
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

  // ─── Actions ───
  const handleStartPoolPlay = () => {
    if (session && state) {
      import('@/engine/tournament-engine').then(({ buildPoolPlayRound }) => {
        const newPoolMatches = buildPoolPlayRound(state, 4);
        useStore.getState().updateSession(session.id, {
          tournamentState: {
            ...state,
            matches: [...state.matches, ...newPoolMatches],
            phase: 'POOL_PLAY'
          }
        });
      });
    }
  };

  const handleGenerateBracket = () => {
    if (session && state) {
      import('@/engine/tournament-engine').then(({ generateBracket }) => {
        const newState = generateBracket(state, session.sessionType!);
        useStore.getState().updateSession(session.id, {
          tournamentState: newState
        });
      });
    }
  };

  const handleAdvanceBracketMatch = (matchId: string, winnerTeamId: string) => {
    if (session && state) {
      import('@/engine/tournament-engine').then(({ advanceMatchWinner }) => {
        const newState = advanceMatchWinner(state, matchId, winnerTeamId);

        // Check if tournament is done (all bracket matches completed)
        const bracketMatches = newState.matches.filter(m => !m.id.startsWith('pool_match_'));
        const allCompleted = bracketMatches.length > 0 && bracketMatches.every(m => m.status === 'COMPLETED');
        
        useStore.getState().updateSession(session.id, {
          tournamentState: {
            ...newState,
            phase: allCompleted ? 'COMPLETED' : newState.phase
          }
        });
      });
    }
  };

  const handleScorePoolMatch = (matchId: string) => {
    if (session && state) {
      const match = state.matches.find(m => m.id === matchId);
      if (!match) return;

      const winnerTeamId = scoreA > scoreB ? match.teamAId : match.teamBId;
      const loserTeamId = scoreA > scoreB ? match.teamBId : match.teamAId;
      
      // Update the match
      const updatedMatches = state.matches.map(m => {
        if (m.id === matchId) {
          return { ...m, scoreA, scoreB, winnerTeamId, status: 'COMPLETED' as const, endedAtEpochMs: Date.now() };
        }
        return m;
      });

      // Update pair stats
      const updatedPairs = state.pairs.map(p => {
        if (p.id === winnerTeamId) {
          return { ...p, poolPlayWins: p.poolPlayWins + 1, poolPlayPointsScored: p.poolPlayPointsScored + Math.max(scoreA, scoreB), poolPlayPointDiff: p.poolPlayPointDiff + Math.abs(scoreA - scoreB) };
        }
        if (p.id === loserTeamId) {
          return { ...p, poolPlayPointsScored: p.poolPlayPointsScored + Math.min(scoreA, scoreB), poolPlayPointDiff: p.poolPlayPointDiff - Math.abs(scoreA - scoreB) };
        }
        return p;
      });

      useStore.getState().updateSession(session.id, {
        tournamentState: { ...state, matches: updatedMatches, pairs: updatedPairs }
      });

      setScoringMatchId(null);
      setScoreA(0);
      setScoreB(0);
    }
  };

  const handleResetTournament = () => {
    if (session) {
      useStore.getState().updateSession(session.id, { tournamentState: undefined });
      setShowResetConfirm(false);
    }
  };

  const handleAdvanceChaosRound = () => {
    if (session && state) {
      import('@/engine/tournament-engine').then(({ advanceChaosRound }) => {
        const newState = advanceChaosRound(state, players);
        useStore.getState().updateSession(session.id, {
          tournamentState: newState
        });
      });
    }
  };

  // ─── Mapped bracket data for BracketTree ───
  const mappedBracketMatches = matches
    .filter(m => !m.id.startsWith('pool_match_'))
    .map(m => {
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
        player1: m.teamAId ? p1Name : null,
        player2: m.teamBId ? p2Name : null,
        player1Id: m.teamAId,
        player2Id: m.teamBId,
        score1: m.scoreA,
        score2: m.scoreB,
        winner: winnerName
      };
    });

  // ─── Pool play status ───
  const poolMatches = matches.filter(m => m.id.startsWith('pool_match_'));
  const completedPoolMatches = poolMatches.filter(m => m.status === 'COMPLETED');
  const pendingPoolMatches = poolMatches.filter(m => m.status !== 'COMPLETED');
  const allPoolDone = poolMatches.length > 0 && pendingPoolMatches.length === 0;

  // ─── Chaos status ───
  const chaosMatches = matches.filter(m => !m.id.startsWith('pool_match_'));
  const maxRound = chaosMatches.length > 0 ? Math.max(...chaosMatches.map(m => m.round)) : 0;
  const currentRoundMatches = chaosMatches.filter(m => m.round === maxRound);
  const canAdvanceChaos = currentRoundMatches.length > 0 && currentRoundMatches.every(m => m.status === 'COMPLETED');

  // ─── Tournament mode label ───
  const modeLabel = session?.sessionType === SessionType.TOURNAMENT_DOUBLES ? '🏆 The Grand Slam' 
    : session?.sessionType === SessionType.TOURNAMENT_SINGLE_ELIM ? '⚡ Knockout Sprint' 
    : '🌪️ Chaos Roulette';

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-y-auto">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">{modeLabel}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{pairs.length} teams • {matches.length} total matches</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
            phase === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
            phase === 'BRACKET' ? 'bg-amber-100 text-amber-800' :
            phase === 'POOL_PLAY' ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {phase === 'COMPLETED' ? '✅ Completed' : phase === 'BRACKET' ? '🏟️ Bracket' : phase === 'POOL_PLAY' ? '🏊 Pool Play' : '📋 Registration'}
          </div>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors"
          >
            Reset Tournament
          </button>
        </div>
      </div>

      {/* ─── Reset Confirmation ─── */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-red-600 mb-2">Reset Tournament?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">This will erase all tournament progress including brackets, pool play results, and pairs. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowResetConfirm(false)} className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleResetTournament} className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors">Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── REGISTRATION Phase ─── */}
      {phase === 'REGISTRATION' && (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-200 gap-4">
          <p className="text-gray-600">Waiting for players to register for the tournament.</p>
          {session?.sessionType === SessionType.TOURNAMENT_DOUBLES ? (
            <button onClick={handleStartPoolPlay} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">
              Start Pool Play
            </button>
          ) : (
            <button onClick={handleGenerateBracket} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">
              Generate Bracket
            </button>
          )}
        </div>
      )}

      {/* ─── POOL PLAY Phase ─── */}
      {phase === 'POOL_PLAY' && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h3 className="text-xl font-semibold">Pool Play Matches</h3>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{completedPoolMatches.length}/{poolMatches.length} completed</span>
              {pendingPoolMatches.length === 0 && poolMatches.length > 0 && (
                <button onClick={handleStartPoolPlay} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                  Generate Next Pool Round
                </button>
              )}
              {allPoolDone && (
                <button onClick={handleGenerateBracket} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors animate-pulse-soft">
                  🏟️ Generate Bracket →
                </button>
              )}
            </div>
          </div>

          {/* Pool Standings */}
          {poolMatches.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h4 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Pool Standings</h4>
              </div>
              <div className="divide-y divide-gray-100">
                {[...pairs].sort((a, b) => b.poolPlayWins - a.poolPlayWins || b.poolPlayPointDiff - a.poolPlayPointDiff).map((pair, idx) => (
                  <div key={pair.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx < 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{idx + 1}</span>
                      <span className="font-medium text-gray-800">{pair.name || getTeamName(pair.id)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-emerald-600 font-bold">{pair.poolPlayWins}W</span>
                      <span className={`font-medium ${pair.poolPlayPointDiff > 0 ? 'text-emerald-600' : pair.poolPlayPointDiff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {pair.poolPlayPointDiff > 0 ? '+' : ''}{pair.poolPlayPointDiff}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pool Match Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {poolMatches.map(match => (
              <div key={match.id} className={`p-4 rounded-xl shadow-sm border transition-all ${
                match.status === 'COMPLETED' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-indigo-300'
              }`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-500">Match {match.matchNumber} (Round {match.round})</span>
                  <span className={`text-xs px-2 py-1 rounded-md font-medium ${
                    match.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>{match.status === 'COMPLETED' ? '✓ Done' : 'Pending'}</span>
                </div>

                <div className={`flex justify-between items-center py-2 border-b border-gray-100 ${match.winnerTeamId === match.teamAId ? 'font-bold text-emerald-700' : ''}`}>
                  <span className="font-medium">{getTeamName(match.teamAId)}</span>
                  <span className="text-gray-400 font-mono">{match.scoreA ?? '-'}</span>
                </div>
                <div className={`flex justify-between items-center py-2 ${match.winnerTeamId === match.teamBId ? 'font-bold text-emerald-700' : ''}`}>
                  <span className="font-medium">{getTeamName(match.teamBId)}</span>
                  <span className="text-gray-400 font-mono">{match.scoreB ?? '-'}</span>
                </div>

                {/* Score input for pending matches */}
                {match.status !== 'COMPLETED' && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {scoringMatchId === match.id ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-gray-500 mb-1 block">{getTeamName(match.teamAId)}</label>
                            <input type="number" min="0" max="99" value={scoreA} onChange={e => setScoreA(parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-center font-bold text-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                          </div>
                          <span className="text-gray-400 font-bold mt-4">vs</span>
                          <div className="flex-1">
                            <label className="text-xs text-gray-500 mb-1 block">{getTeamName(match.teamBId)}</label>
                            <input type="number" min="0" max="99" value={scoreB} onChange={e => setScoreB(parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-center font-bold text-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setScoringMatchId(null); setScoreA(0); setScoreB(0); }} className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors font-medium">Cancel</button>
                          <button onClick={() => handleScorePoolMatch(match.id)} disabled={scoreA === scoreB}
                            className="flex-1 px-3 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-medium transition-colors">
                            {scoreA === scoreB ? 'Scores must differ' : 'Submit Score'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setScoringMatchId(match.id)} className="w-full px-3 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors">
                        Enter Score
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {poolMatches.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center p-8 text-gray-500 bg-white rounded-xl border border-gray-200 shadow-sm gap-3">
                <p>No pool matches scheduled yet.</p>
                <button onClick={handleStartPoolPlay} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">
                  Start Pool Play
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── BRACKET Phase ─── */}
      {phase === 'BRACKET' && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h3 className="text-xl font-semibold">Bracket Phase</h3>
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-500">Tap a team to advance them</p>
              {session?.sessionType === SessionType.TOURNAMENT_CHAOS && canAdvanceChaos && (
                <button onClick={handleAdvanceChaosRound} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors animate-pulse-soft">
                  🌪️ Generate Next Chaos Round
                </button>
              )}
            </div>
          </div>
          <BracketTree matches={mappedBracketMatches} onMatchClick={handleAdvanceBracketMatch} />
        </div>
      )}
      
      {/* ─── COMPLETED Phase ─── */}
      {phase === 'COMPLETED' && (
        <div className="flex flex-col gap-4">
          <BracketTree matches={mappedBracketMatches} />
        </div>
      )}
    </div>
  );
}
