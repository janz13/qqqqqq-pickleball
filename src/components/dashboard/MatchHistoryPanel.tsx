'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import { Team, Player, Match } from '@/types/models';
import { 
  History, 
  Trophy, 
  Users, 
  Clock, 
  ArrowLeftRight, 
  CheckCircle2, 
  AlertTriangle, 
  X,
  Swords,
  Timer
} from 'lucide-react';

export default function MatchHistoryPanel() {
  const { matches, players, courts, roster, reverseMatchWinner } = useStore();
  const [matchToReverse, setMatchToReverse] = useState<Match | null>(null);

  // Filter completed matches (where endedAtEpochMs is not null)
  const completedMatches = matches.filter(m => m.endedAtEpochMs !== null);

  // Sort from most recent to oldest
  const sortedMatches = [...completedMatches].sort(
    (a, b) => (b.endedAtEpochMs ?? 0) - (a.endedAtEpochMs ?? 0)
  );

  // Calculate chronological match number (1, 2, 3...) based on start time
  const matchNumberMap = new Map<string, number>();
  [...matches]
    .sort((a, b) => a.startedAtEpochMs - b.startedAtEpochMs)
    .forEach((m, index) => {
      matchNumberMap.set(m.id, index + 1);
    });

  // Calculate summary metrics
  const totalMatchesPlayed = completedMatches.length;
  const uniquePlayerIds = new Set<string>();
  let totalDurationMs = 0;

  completedMatches.forEach(m => {
    [...m.teamA, ...m.teamB].forEach(id => uniquePlayerIds.add(id));
    if (m.endedAtEpochMs && m.endedAtEpochMs >= m.startedAtEpochMs) {
      totalDurationMs += m.endedAtEpochMs - m.startedAtEpochMs;
    }
  });

  const totalUniquePlayers = uniquePlayerIds.size;
  const avgDurationMinutes = totalMatchesPlayed > 0 
    ? Math.round((totalDurationMs / totalMatchesPlayed) / 60000) 
    : 0;

  // Helper to find player object from current players or roster
  const getPlayer = (id: string): Player | undefined => {
    return players.find(p => p.id === id) || roster.find(p => p.id === id);
  };

  // Helper to get court label
  const getCourtLabel = (courtId: string): string => {
    const court = courts.find(c => c.id === courtId);
    return court ? court.label : 'Court';
  };

  // Helper to format match duration
  const formatDuration = (startedAt: number, endedAt: number | null): string => {
    if (!endedAt || endedAt < startedAt) return '< 1 min';
    const totalSeconds = Math.floor((endedAt - startedAt) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  };

  // Helper to format timestamp
  const formatEndTime = (endedAt: number | null): string => {
    if (!endedAt) return '';
    return new Date(endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleConfirmReverse = () => {
    if (matchToReverse) {
      reverseMatchWinner(matchToReverse.id);
      setMatchToReverse(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto animate-slide-up">
      {/* Header & Summary Statistics */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-sm">
              <History size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                Match History
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Review completed session matches and adjust results
              </p>
            </div>
          </div>
        </div>

        {/* Summary Metric Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm p-4 rounded-2xl flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Swords size={24} />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Total Matches
              </span>
              <div className="text-2xl font-black text-gray-900 dark:text-gray-100">
                {totalMatchesPlayed}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm p-4 rounded-2xl flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Users size={24} />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Unique Players
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {totalUniquePlayers}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm p-4 rounded-2xl flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Timer size={24} />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Avg Duration
              </span>
              <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
                {totalMatchesPlayed > 0 ? `${avgDurationMinutes} min` : '0 min'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Matches List or Empty State */}
      {sortedMatches.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-gray-400 dark:text-gray-500">
            <History size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
            No completed matches yet
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Matches that are finished on the courts will appear here automatically with full duration stats and result management.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sortedMatches.map((match) => {
            const matchNumber = matchNumberMap.get(match.id) ?? 1;
            const courtLabel = getCourtLabel(match.courtId);
            const teamAPlayers = match.teamA.map(id => getPlayer(id));
            const teamBPlayers = match.teamB.map(id => getPlayer(id));
            const isWinnerA = match.winner === Team.A;
            const isWinnerB = match.winner === Team.B;
            const duration = formatDuration(match.startedAtEpochMs, match.endedAtEpochMs);
            const endTime = formatEndTime(match.endedAtEpochMs);

            return (
              <div
                key={match.id}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                {/* Match Header Bar */}
                <div className="px-5 py-3 bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                      Match #{matchNumber}
                    </span>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {courtLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} className="text-gray-400" />
                      <span>{duration}</span>
                    </div>
                    {endTime && (
                      <span className="text-gray-400 dark:text-gray-600">
                        Ended at {endTime}
                      </span>
                    )}
                  </div>
                </div>

                {/* Match Teams and Winner Display */}
                <div className="p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
                  {/* Teams Matchup Container */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                    {/* Team A Card */}
                    <div
                      className={`p-4 rounded-xl transition-all border ${
                        isWinnerA
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 shadow-sm'
                          : 'bg-gray-50/60 dark:bg-gray-800/30 border-gray-200/70 dark:border-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Team 1
                        </span>
                        {isWinnerA && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-sm">
                            <Trophy size={11} />
                            Winner
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        {teamAPlayers.map((p, idx) => (
                          <div key={p?.id || idx} className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden shadow-sm">
                              {p?.photoUrl ? (
                                <img src={p.photoUrl} alt={p?.name || 'Player'} className="w-full h-full object-cover" />
                              ) : (
                                (p?.name || '??').substring(0, 2).toUpperCase()
                              )}
                            </div>
                            <span className={`text-sm font-semibold truncate ${
                              isWinnerA ? 'text-emerald-950 dark:text-emerald-200' : 'text-gray-800 dark:text-gray-200'
                            }`}>
                              {p?.name || 'Unknown Player'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Team B Card */}
                    <div
                      className={`p-4 rounded-xl transition-all border ${
                        isWinnerB
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 shadow-sm'
                          : 'bg-gray-50/60 dark:bg-gray-800/30 border-gray-200/70 dark:border-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Team 2
                        </span>
                        {isWinnerB && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-sm">
                            <Trophy size={11} />
                            Winner
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        {teamBPlayers.map((p, idx) => (
                          <div key={p?.id || idx} className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-r from-rose-400 to-rose-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden shadow-sm">
                              {p?.photoUrl ? (
                                <img src={p.photoUrl} alt={p?.name || 'Player'} className="w-full h-full object-cover" />
                              ) : (
                                (p?.name || '??').substring(0, 2).toUpperCase()
                              )}
                            </div>
                            <span className={`text-sm font-semibold truncate ${
                              isWinnerB ? 'text-emerald-950 dark:text-emerald-200' : 'text-gray-800 dark:text-gray-200'
                            }`}>
                              {p?.name || 'Unknown Player'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Score / Reverse Win Button */}
                  <div className="flex md:flex-col items-center justify-end gap-3 md:pl-4 md:border-l md:border-gray-100 md:dark:border-gray-800">
                    {match.scoreA !== null && match.scoreB !== null && (
                      <div className="text-center font-mono font-bold text-sm text-gray-500 dark:text-gray-400">
                        Score: <span className="text-gray-800 dark:text-gray-200">{match.scoreA} - {match.scoreB}</span>
                      </div>
                    )}

                    <button
                      onClick={() => setMatchToReverse(match)}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-gray-100 hover:bg-amber-50 dark:bg-gray-800 dark:hover:bg-amber-950/30 text-gray-700 hover:text-amber-700 dark:text-gray-300 dark:hover:text-amber-400 border border-gray-200 hover:border-amber-300 dark:border-gray-700 dark:hover:border-amber-800/50 transition-all duration-150 shadow-sm active:scale-95"
                      title="Reverse the winner of this match"
                    >
                      <ArrowLeftRight size={14} className="text-amber-500" />
                      <span>Reverse Win</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reverse Winner Confirmation Modal */}
      {matchToReverse && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setMatchToReverse(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <ArrowLeftRight size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    Reverse Match Winner
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Match #{matchNumberMap.get(matchToReverse.id) ?? 1} • {getCourtLabel(matchToReverse.courtId)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMatchToReverse(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content Details */}
            <div className="space-y-4 text-sm mb-6">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4 flex gap-3 text-amber-900 dark:text-amber-200">
                <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  This will flip the winner of this match. Player win/loss records for both the session and all-time stats will be updated automatically.
                </div>
              </div>

              {/* Current vs New Winner Preview */}
              {(() => {
                const isCurrentWinnerA = matchToReverse.winner === Team.A;
                const teamANames = matchToReverse.teamA
                  .map(id => getPlayer(id)?.name || 'Unknown')
                  .join(' & ');
                const teamBNames = matchToReverse.teamB
                  .map(id => getPlayer(id)?.name || 'Unknown')
                  .join(' & ');

                const currentWinningNames = isCurrentWinnerA ? teamANames : teamBNames;
                const newWinningNames = isCurrentWinnerA ? teamBNames : teamANames;

                return (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 space-y-3 border border-gray-100 dark:border-gray-800">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">Current Winner:</span>
                      <span className="font-bold text-gray-700 dark:text-gray-300">
                        {isCurrentWinnerA ? 'Team 1' : 'Team 2'} ({currentWinningNames})
                      </span>
                    </div>

                    <div className="flex items-center justify-center">
                      <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1" />
                      <span className="px-2 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase">Becomes</span>
                      <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1" />
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">New Winner:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {isCurrentWinnerA ? 'Team 2' : 'Team 1'} ({newWinningNames})
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setMatchToReverse(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReverse}
                className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold rounded-xl text-sm shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} />
                Confirm Reverse
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export { MatchHistoryPanel };
