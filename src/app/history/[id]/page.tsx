'use client';

import { useStore } from '@/lib/store';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Trophy, ArrowLeft, Clock, Users, Hash, Medal, Award, CheckCircle } from 'lucide-react';
import { Player, Session, Court, Match } from '@/types/models';
import { getSortedPlayers } from '@/utils/leaderboard';

export default function HistoryPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const isPlayerView = searchParams.get('playerView') === 'true';
  const id = params.id as string;
  const sessionHistory = useStore(state => state.sessionHistory);
  const [historyItem, setHistoryItem] = useState<{session: Session, players: Player[], courts: Court[], matches: Match[], endedAtEpochMs: number} | null>(null);
  const [showCongrats, setShowCongrats] = useState(false);
  const [congratsRank, setCongratsRank] = useState<number | null>(null);
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const item = sessionHistory.find(h => h.session.id === id);
      if (item) {
        setHistoryItem(item);
        setIsLoading(false);
        return;
      }
      
      // Fallback: Fetch from cloud if not in local history
      try {
        const { createClient } = require('@/lib/supabase');
        const supabase = createClient();
        const { data, error } = await supabase.from('sessions').select('*').eq('id', id).single();
        if (data && data.state_json) {
           setHistoryItem({
             session: data.state_json.session,
             players: data.state_json.players,
             courts: data.state_json.courts,
             matches: data.state_json.matches,
             endedAtEpochMs: Date.now() // Approximation if missing
           });
        } else {
           console.error("Cloud fetch failed:", error);
        }
      } catch(e) {
        console.error("Error fetching history from cloud", e);
      }
      setIsLoading(false);
    };
    
    fetchHistory();
  }, [id, sessionHistory]);

  useEffect(() => {
    if (historyItem && isPlayerView) {
      const sortedPlayers = getSortedPlayers(historyItem.players, historyItem.matches);
      const top3 = sortedPlayers.slice(0, 3);
      const myId = localStorage.getItem(`qqqqqq_identity_${id}`);
      if (myId) {
        const myRankIndex = top3.findIndex(p => p.id === myId);
        if (myRankIndex !== -1) {
          setTimeout(() => {
            setCongratsRank(myRankIndex + 1);
            setShowCongrats(true);
          }, 0);
        }
      }
    }
  }, [historyItem, id, isPlayerView]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!historyItem) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="text-gray-400" size={32} />
          </div>
          <h2 className="text-2xl font-black mb-2 text-gray-900 dark:text-white">Session Not Found</h2>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">This session may have been deleted or is no longer available.</p>
          <button onClick={() => router.push('/')} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 mx-auto">
            <ArrowLeft size={18} /> Go Home
          </button>
        </div>
      </div>
    );
  }

  const sortedPlayers = getSortedPlayers(historyItem.players, historyItem.matches);
  const totalMatches = historyItem.matches.length;
  const top3 = sortedPlayers.slice(0, 3);
  
  // Calculate some fun stats
  const totalGamesPlayed = historyItem.players.reduce((sum: number, p: Player) => sum + p.sessionGamesPlayed, 0);
  const averageGamesPerPlayer = historyItem.players.length > 0 ? (totalGamesPlayed / historyItem.players.length).toFixed(1) : '0';
  const mostActivePlayer = [...historyItem.players].sort((a, b) => b.sessionGamesPlayed - a.sessionGamesPlayed)[0];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 p-4 md:p-8">
      {isPlayerView && (
        <div className="bg-emerald-500/20 text-emerald-100 py-3 px-4 flex items-center justify-center gap-2 border-b border-emerald-500/30">
          <CheckCircle size={18} />
          <span className="font-semibold text-sm">Session Ended</span>
        </div>
      )}
      
      <header className="glass-dark sticky top-0 z-10 px-4 py-4 border-b border-white/10 rounded-none mb-6">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          {!isPlayerView && (
            <button onClick={() => router.push('/')} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ArrowLeft size={20} />
            </button>
          )}
          <h1 className="text-3xl font-bold tracking-tight">{historyItem.session.name} - Analysis</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col gap-2">
            <div className="text-gray-500 dark:text-gray-400 flex items-center gap-2"><Hash size={18}/> Total Matches</div>
            <div className="text-4xl font-black text-blue-600 dark:text-blue-400">{totalMatches}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col gap-2">
            <div className="text-gray-500 dark:text-gray-400 flex items-center gap-2"><Users size={18}/> Total Players</div>
            <div className="text-4xl font-black text-emerald-600 dark:text-emerald-400">{historyItem.players.length}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col gap-2">
            <div className="text-gray-500 dark:text-gray-400 flex items-center gap-2"><Clock size={18}/> Ended At</div>
            <div className="text-lg font-bold">{new Date(historyItem.endedAtEpochMs).toLocaleTimeString()}</div>
          </div>
        </div>

        {top3.length > 0 && (
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-amber-200 dark:border-amber-900/30 overflow-hidden">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3"><Trophy className="text-amber-500" /> Top 3 Players</h2>
            <div className="flex justify-center items-end gap-4 sm:gap-8 h-48 px-4 mt-8">
              {/* Second Place */}
              {top3[1] && (
                <div className="flex flex-col items-center flex-1 max-w-[120px]">
                  <div className="bg-gray-100 dark:bg-gray-800 w-full pt-4 pb-2 px-2 flex flex-col items-center rounded-t-xl relative border-t-4 border-slate-400">
                    <Medal className="text-slate-400 absolute -top-5" size={28} />
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-slate-400 to-slate-500 text-white flex items-center justify-center font-bold text-sm shadow-md mb-2 overflow-hidden">
                      {top3[1].photoUrl ? <img src={top3[1].photoUrl} alt="Avatar" className="w-full h-full object-cover" /> : top3[1].name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="font-bold text-center text-sm truncate w-full">{top3[1].name}</div>
                  </div>
                  <div className="w-full h-20 bg-gradient-to-t from-slate-300 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex justify-center pt-2">
                    <span className="text-2xl font-black text-slate-500/50">2</span>
                  </div>
                </div>
              )}
              {/* First Place */}
              {top3[0] && (
                <div className="flex flex-col items-center flex-1 max-w-[140px] z-10">
                  <div className="bg-amber-50 dark:bg-amber-900/20 w-full pt-6 pb-3 px-2 flex flex-col items-center rounded-t-xl relative border-t-4 border-amber-400 shadow-lg">
                    <Trophy className="text-amber-500 absolute -top-6" size={36} />
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white flex items-center justify-center font-bold text-base shadow-lg mb-2 ring-4 ring-amber-400/20 overflow-hidden">
                      {top3[0].photoUrl ? <img src={top3[0].photoUrl} alt="Avatar" className="w-full h-full object-cover" /> : top3[0].name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="font-bold text-center text-base truncate w-full">{top3[0].name}</div>
                  </div>
                  <div className="w-full h-28 bg-gradient-to-t from-amber-400 to-yellow-300 dark:from-amber-600 dark:to-amber-500 flex justify-center pt-2 shadow-inner">
                    <span className="text-3xl font-black text-amber-600/50 dark:text-amber-900/30">1</span>
                  </div>
                </div>
              )}
              {/* Third Place */}
              {top3[2] && (
                <div className="flex flex-col items-center flex-1 max-w-[120px]">
                  <div className="bg-gray-100 dark:bg-gray-800 w-full pt-4 pb-2 px-2 flex flex-col items-center rounded-t-xl relative border-t-4 border-orange-700">
                    <Award className="text-orange-700 absolute -top-5" size={28} />
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-600 to-orange-700 text-white flex items-center justify-center font-bold text-sm shadow-md mb-2 overflow-hidden">
                      {top3[2].photoUrl ? <img src={top3[2].photoUrl} alt="Avatar" className="w-full h-full object-cover" /> : top3[2].name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="font-bold text-center text-sm truncate w-full">{top3[2].name}</div>
                  </div>
                  <div className="w-full h-16 bg-gradient-to-t from-orange-300 to-orange-200 dark:from-orange-900/60 dark:to-orange-800/60 flex justify-center pt-2">
                    <span className="text-2xl font-black text-orange-800/30">3</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden p-6">
          <h2 className="text-xl font-bold mb-4">In-Depth Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Average Games Per Player</div>
              <div className="text-2xl font-bold">{averageGamesPerPlayer}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Most Active Player</div>
              <div className="text-xl font-bold">{mostActivePlayer?.name || 'N/A'} <span className="text-sm font-normal text-gray-500">({mostActivePlayer?.sessionGamesPlayed || 0} games)</span></div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
            <h2 className="text-2xl font-bold">Final Leaderboard</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 font-medium">
                <tr>
                  <th className="px-6 py-4">Rank</th>
                  <th className="px-6 py-4">Player</th>
                  <th className="px-6 py-4 text-center">W - L</th>
                  <th className="px-6 py-4 text-center">Win %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {sortedPlayers.map((player: Player, idx: number) => {
                  const winPct = player.sessionGamesPlayed > 0 ? Math.round((player.sessionWins / player.sessionGamesPlayed) * 100) : 0;
                  return (
                    <tr key={player.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-400">#{idx + 1}</td>
                      <td className="px-6 py-4 font-bold">{player.name}</td>
                      <td className="px-6 py-4 text-center font-medium">
                        <span className="text-emerald-600 dark:text-emerald-400">{player.sessionWins}</span>
                        <span className="text-gray-400 mx-1">-</span>
                        <span className="text-rose-600 dark:text-rose-400">{player.sessionLosses}</span>
                      </td>
                      <td className="px-6 py-4 text-center font-bold">{winPct}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCongrats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={() => setShowCongrats(false)}>
          <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-1 rounded-3xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="bg-white dark:bg-gray-900 rounded-[22px] p-8 max-w-sm w-full text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-100/20 to-transparent"></div>
              <Medal size={80} className="mx-auto text-amber-500 mb-6 drop-shadow-lg" />
              <h2 className="text-4xl font-black mb-2 bg-gradient-to-br from-amber-500 to-orange-600 bg-clip-text text-transparent">
                Congratulations!
              </h2>
              <p className="text-xl font-medium text-gray-600 dark:text-gray-300 mb-8">
                You finished in <strong className="text-gray-900 dark:text-white text-2xl">#{congratsRank}</strong> place!
              </p>
              <button 
                onClick={() => setShowCongrats(false)}
                className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-lg rounded-xl shadow-xl shadow-orange-500/20 transition-all"
              >
                Awesome!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
