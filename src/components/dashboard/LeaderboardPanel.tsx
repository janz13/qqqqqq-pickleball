'use client';

import { useStore } from '@/lib/store';
import { Trophy, Medal, Award, RefreshCw, GitMerge } from 'lucide-react';
import { PlayerCard } from '@/components/ui/PlayerCard';
import { getSortedPlayers } from '@/utils/leaderboard';
import { TournamentLeaderboard } from '@/components/ui/TournamentLeaderboard';
import { useState } from 'react';

export default function LeaderboardPanel() {
  const { players, matches, roster, currentUser, session, syncCloudRoster } = useStore();
  const [viewMode, setViewMode] = useState<'session' | 'alltime'>('session');
  const [isSyncing, setIsSyncing] = useState(false);

  const activeUid = currentUser?.id || (session?.ownerUid && !session.ownerUid.startsWith('guest_') ? session.ownerUid : null);

  const handleSync = async () => {
    if (activeUid && !activeUid.startsWith('guest_')) {
      setIsSyncing(true);
      await syncCloudRoster(activeUid);
      setIsSyncing(false);
    }
  };
  
  // Custom sort for all-time since getSortedPlayers uses session properties
  const sortedPlayers = viewMode === 'session' 
    ? getSortedPlayers(players, matches)
    : [...roster].sort((a, b) => {
        if (b.allTimeWins !== a.allTimeWins) return b.allTimeWins - a.allTimeWins;
        const aPct = a.allTimeGamesPlayed > 0 ? a.allTimeWins / a.allTimeGamesPlayed : 0;
        const bPct = b.allTimeGamesPlayed > 0 ? b.allTimeWins / b.allTimeGamesPlayed : 0;
        return bPct - aPct;
      });

  const top3 = sortedPlayers.slice(0, 3);

  const getWinPct = (wins: number, games: number) => {
    if (games === 0) return 0;
    return Math.round((wins / games) * 100);
  };

  const isTeamTournament = viewMode === 'session' && session?.sessionType && (session.sessionType === 'TOURNAMENT_DOUBLES' || session.sessionType === 'TOURNAMENT_SINGLE_ELIM');

  return (
    <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto animate-slide-up">
      <div className="flex justify-center items-center gap-3 mt-4">
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl inline-flex shadow-inner border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setViewMode('session')}
            className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
              viewMode === 'session' 
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm border border-gray-200 dark:border-gray-600' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Current Session
          </button>
          <button
            onClick={() => setViewMode('alltime')}
            className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
              viewMode === 'alltime' 
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm border border-gray-200 dark:border-gray-600' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            All-Time History
          </button>
        </div>

        {viewMode === 'alltime' && currentUser && !currentUser.id.startsWith('guest_') && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="p-2 text-gray-500 hover:text-blue-600 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shadow-sm border border-gray-200 dark:border-gray-700"
            title="Refresh All-Time stats from Cloud"
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin text-blue-600' : ''} />
          </button>
        )}
      </div>

      {isTeamTournament && session.tournamentState ? (
        <div className="animate-slide-up w-full">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-black text-gray-800 dark:text-gray-200">Team Standings</h2>
            <p className="text-gray-500">Based on bracket progress and pool play</p>
          </div>
          <TournamentLeaderboard tournamentState={session.tournamentState} players={players} />
        </div>
      ) : (
        <>
          {top3.length > 0 && (
            <div className="flex justify-center items-end gap-3 sm:gap-6 h-56 px-4">
              {/* Second Place */}
              {top3[1] && (
                <div className="flex flex-col items-center flex-1 max-w-[140px] animate-slide-up" style={{ animationDelay: '0.1s' }}>
                  <div className="bg-white dark:bg-gray-900 w-full pt-4 pb-2 px-2 flex flex-col items-center rounded-t-3xl border border-gray-200 dark:border-gray-800 border-b-0 translate-y-2 relative shadow-sm">
                    <Medal className="text-slate-400 absolute -top-5 drop-shadow-md" size={32} />
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-slate-400 to-slate-500 text-white flex items-center justify-center font-bold text-sm shadow-md mb-2 overflow-hidden">
                      {top3[1].photoUrl ? <img src={top3[1].photoUrl} alt="Avatar" className="w-full h-full object-cover" /> : top3[1].name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="font-bold text-center text-sm truncate w-full text-gray-900 dark:text-gray-100">{top3[1].name}</div>
                    <div className="text-xs font-semibold text-slate-500">
                      {viewMode === 'session' ? top3[1].sessionWins : top3[1].allTimeWins} Wins {viewMode === 'alltime' ? `(${top3[1].allTimeGamesPlayed} GP)` : ''}
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
                      {top3[0].photoUrl ? <img src={top3[0].photoUrl} alt="Avatar" className="w-full h-full object-cover" /> : top3[0].name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="font-black text-center text-base truncate w-full text-gray-900 dark:text-gray-100">{top3[0].name}</div>
                    <div className="text-sm font-bold text-amber-600 dark:text-amber-500">
                      {viewMode === 'session' ? top3[0].sessionWins : top3[0].allTimeWins} Wins {viewMode === 'alltime' ? `(${top3[0].allTimeGamesPlayed} GP)` : ''}
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
                      {top3[2].photoUrl ? <img src={top3[2].photoUrl} alt="Avatar" className="w-full h-full object-cover" /> : top3[2].name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="font-bold text-center text-sm truncate w-full text-gray-900 dark:text-gray-100">{top3[2].name}</div>
                    <div className="text-xs font-semibold text-slate-500">
                      {viewMode === 'session' ? top3[2].sessionWins : top3[2].allTimeWins} Wins {viewMode === 'alltime' ? `(${top3[2].allTimeGamesPlayed} GP)` : ''}
                    </div>
                  </div>
                  <div className="w-full h-20 bg-gradient-to-t from-orange-200 to-orange-100 dark:from-orange-900/60 dark:to-orange-800/60 rounded-t-xl flex justify-center pt-3 shadow-inner">
                    <span className="text-3xl font-black text-orange-400/50 dark:text-orange-500/30">3</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {sortedPlayers.length > 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden mb-8">
              <div className="hidden sm:grid grid-cols-12 gap-4 p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <div className="col-span-1 text-center">Rank</div>
                <div className="col-span-4">Player</div>
                <div className="col-span-2 text-center">Wins</div>
                <div className="col-span-2 text-center">Losses</div>
                <div className="col-span-3 text-center">Win %</div>
              </div>
              
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {sortedPlayers.map((player, index) => {
                  const wins = viewMode === 'session' ? player.sessionWins : player.allTimeWins;
                  const losses = viewMode === 'session' ? player.sessionLosses : player.allTimeLosses;
                  const gamesPlayed = viewMode === 'session' ? player.sessionGamesPlayed : player.allTimeGamesPlayed;
                  const winPct = getWinPct(wins, gamesPlayed);
                  
                  return (
                    <div key={player.id} className="grid grid-cols-1 sm:grid-cols-12 gap-4 p-4 items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <div className="hidden sm:flex col-span-1 justify-center">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          index === 0 ? 'bg-yellow-100 text-yellow-700' : 
                          index === 1 ? 'bg-slate-100 text-slate-700' :
                          index === 2 ? 'bg-orange-100 text-orange-700' :
                          'text-gray-400 font-medium'
                        }`}>
                          {index + 1}
                        </span>
                      </div>
                      
                      <div className="sm:col-span-4">
                        <PlayerCard player={player} compact={true} />
                      </div>
                      
                      {/* Mobile stats row */}
                      <div className="flex sm:hidden justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700 mt-2">
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-1">Rank</div>
                          <div className="font-bold text-gray-900 dark:text-gray-100">#{index + 1}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-500 mb-1">W - L</div>
                          <div className="font-bold text-gray-900 dark:text-gray-100">{wins} - {losses}</div>
                        </div>
                        <div className="text-center w-24">
                          <div className="text-xs text-gray-500 mb-1">Win %</div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1.5">
                            <div 
                              className={`h-2 rounded-full ${winPct >= 70 ? 'bg-emerald-500' : winPct >= 40 ? 'bg-blue-500' : 'bg-gray-400'}`}
                              style={{ width: `${winPct}%` }}
                            ></div>
                          </div>
                          <div className="text-[10px] font-bold mt-1 text-gray-700 dark:text-gray-300">{winPct}%</div>
                        </div>
                      </div>

                      {/* Desktop stats cols */}
                      <div className="hidden sm:block col-span-2 text-center font-bold text-gray-900 dark:text-gray-100">{wins}</div>
                      <div className="hidden sm:block col-span-2 text-center font-bold text-gray-900 dark:text-gray-100">{losses}</div>
                      <div className="hidden sm:flex col-span-3 items-center gap-3">
                        <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden border border-gray-200 dark:border-gray-700">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${
                              winPct >= 70 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 
                              winPct >= 40 ? 'bg-gradient-to-r from-blue-400 to-blue-500' : 
                              'bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-500'
                            }`}
                            style={{ width: `${winPct}%` }}
                          />
                        </div>
                        <span className="font-bold text-sm w-10 text-right text-gray-700 dark:text-gray-300">{winPct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 shadow-sm">
              <Award size={48} className="mb-4 opacity-20" />
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100">No players found</p>
              <p className="text-sm mt-1">Add players to the roster to see rankings.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
