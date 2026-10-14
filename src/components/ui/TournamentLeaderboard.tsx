'use client';

import React from 'react';
import { TournamentState, Player, SessionType } from '@/types/models';
import { Trophy, Medal, Award, Users } from 'lucide-react';
import { useStore } from '@/lib/store';
import { rankTournament, RankedTournamentItem, getTeamName, getTeamInitials } from '@/utils/tournamentRanking';

export interface TournamentLeaderboardProps {
  tournamentState: TournamentState;
  players: Player[];
  sessionType?: SessionType;
}

export function TournamentLeaderboard({ tournamentState, players, sessionType }: TournamentLeaderboardProps) {
  const storeSession = useStore(state => state.session);
  const resolvedSessionType = sessionType || storeSession?.sessionType || SessionType.TOURNAMENT_DOUBLES;

  if (!tournamentState || tournamentState.pairs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Trophy size={48} className="mb-4 opacity-20 text-gray-400" />
        <p className="font-semibold text-gray-400">Tournament not started yet</p>
      </div>
    );
  }

  const { pairs, matches } = tournamentState;

  // Check if any matches are completed yet
  const hasCompletedMatches = matches.some(
    m => m.status === 'COMPLETED' || (m.winnerTeamId != null && m.winnerTeamId !== '')
  );

  // If no matches completed, show Seeding List instead of Podium
  if (!hasCompletedMatches) {
    const sortedSeeds = [...pairs].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));

    return (
      <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto animate-slide-up">
        <div className="bg-gray-100 dark:bg-gray-800/60 p-5 rounded-2xl border border-gray-200 dark:border-gray-700/60 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 mb-2">
            <Users size={24} />
          </div>
          <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">Tournament Seeding</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1">
            Matches are preparing to start. Initial seeds are shown below; rankings will calculate as matches finish.
          </p>
        </div>

        <div className="space-y-2.5">
          {sortedSeeds.map((pair, idx) => {
            const teamName = getTeamName(pair, players);
            const initials = getTeamInitials(pair, players);
            const p1 = players.find(p => p.id === pair.player1Id);
            const p2 = players.find(p => p.id === pair.player2Id);

            return (
              <div
                key={pair.id}
                className="min-h-[52px] bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center justify-between gap-4 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg font-black text-xs flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shrink-0">
                    #{pair.seed ?? idx + 1}
                  </div>
                  <div className="w-9 h-9 rounded-full bg-gray-800 dark:bg-gray-700 text-gray-100 flex items-center justify-center text-xs font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-sm text-gray-900 dark:text-gray-100 truncate">
                      {teamName}
                    </div>
                    {(p1 || p2) && (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                        {p1 && <span>{p1.name} (Lvl {p1.skillLevel})</span>}
                        {p1 && p2 && <span>•</span>}
                        {p2 && <span>{p2.name} (Lvl {p2.skillLevel})</span>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Seed {pair.seed ?? idx + 1}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Calculate bracket-aware tournament rankings
  const rankings: RankedTournamentItem[] = rankTournament(tournamentState, players, resolvedSessionType);
  const top3 = rankings.slice(0, 3);
  const others = rankings.slice(3);

  return (
    <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto animate-slide-up">
      {/* ─── Top 3 Podium ─── */}
      {top3.length > 0 && (
        <div className="flex justify-center items-end gap-3 sm:gap-6 h-56 px-4 mt-6">
          {/* Second Place */}
          {top3[1] && (
            <div className="flex flex-col items-center flex-1 max-w-[140px] animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <div className="bg-white dark:bg-gray-900 w-full pt-4 pb-2 px-2 flex flex-col items-center rounded-t-3xl border border-gray-200 dark:border-gray-800 border-b-0 translate-y-2 relative shadow-sm">
                <Medal className="text-slate-400 absolute -top-5 drop-shadow-md" size={32} />
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-slate-400 to-slate-500 text-white flex items-center justify-center font-bold text-sm shadow-md mb-2 overflow-hidden">
                  {top3[1].photoUrl ? (
                    <img src={top3[1].photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    top3[1].initials
                  )}
                </div>
                <div className="font-bold text-center text-sm truncate w-full text-gray-900 dark:text-gray-100">
                  {top3[1].name}
                </div>
                <div className="text-xs font-semibold text-slate-500 truncate w-full text-center">
                  {top3[1].detail}
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
                  {top3[0].photoUrl ? (
                    <img src={top3[0].photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    top3[0].initials
                  )}
                </div>
                <div className="font-black text-center text-base truncate w-full text-gray-900 dark:text-gray-100">
                  {top3[0].name}
                </div>
                <div className="text-sm font-bold text-amber-600 dark:text-amber-500 truncate w-full text-center">
                  {top3[0].detail}
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
                <Award className="text-orange-400 absolute -top-5 drop-shadow-md" size={32} />
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-300 to-orange-400 text-white flex items-center justify-center font-bold text-sm shadow-md mb-2 overflow-hidden">
                  {top3[2].photoUrl ? (
                    <img src={top3[2].photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    top3[2].initials
                  )}
                </div>
                <div className="font-bold text-center text-sm truncate w-full text-gray-900 dark:text-gray-100">
                  {top3[2].name}
                </div>
                <div className="text-xs font-semibold text-slate-500 truncate w-full text-center">
                  {top3[2].detail}
                </div>
              </div>
              <div className="w-full h-20 bg-gradient-to-t from-orange-200 to-orange-100 dark:from-orange-900/60 dark:to-orange-800/60 rounded-t-xl flex justify-center pt-3 shadow-inner">
                <span className="text-3xl font-black text-orange-400/50 dark:text-orange-500/30">3</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Remaining Standings ─── */}
      {others.length > 0 && (
        <div className="space-y-3 mt-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider pl-2">
            {resolvedSessionType === SessionType.TOURNAMENT_CHAOS ? 'Other Players' : 'Other Teams'}
          </h3>
          {others.map((item) => (
            <div
              key={item.id}
              className="min-h-[52px] bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0">
                {item.rank}
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 dark:text-gray-100 truncate">
                  {item.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{item.detail}</span>
                  {item.subDetail && (
                    <span className="text-gray-400">• {item.subDetail}</span>
                  )}
                  {item.pointDiff !== 0 && (
                    <span className={item.pointDiff > 0 ? 'text-emerald-500 font-semibold' : 'text-rose-500 font-semibold'}>
                      Diff: {item.pointDiff > 0 ? '+' : ''}{item.pointDiff}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
