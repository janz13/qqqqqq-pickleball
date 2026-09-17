'use client';

import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { CourtStatus, PlayerStatus, Team } from '@/types/models';
import { PlayerCard } from '@/components/ui/PlayerCard';
import { CourtCard } from '@/components/ui/CourtCard';
import { Users, LayoutGrid, Bell, CheckCircle, Megaphone, Trophy, Swords, Clock, Filter } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { buildNextBatches } from '@/engine/queue-engine';
import { pairFour } from '@/engine/pairing-engine';

export default function PlayerMonitorPage() {
  const params = useParams();
  const rawCode = params?.code;
  const code = (typeof rawCode === 'string' ? rawCode : Array.isArray(rawCode) ? rawCode[0] : '').toUpperCase();
  const router = useRouter();
  const { session, courts, players, matches } = useStore();
  
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showIdentifyModal, setShowIdentifyModal] = useState(false);
  const [activeNotification, setActiveNotification] = useState<{court: string, partner: string, opponents: string} | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const lastMatchId = useRef<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'queue' | 'games' | 'leaderboards'>('queue');
  const [gamesFilter, setGamesFilter] = useState<'all' | 'mine'>('all');

  // Track the latest cloud timestamp to NEVER allow stale data to overwrite newer data
  const lastCloudTimestamp = useRef<string>('');

  // Cloud Sync for Player View — this is the single source of truth.
  // We track updated_at timestamps so that stale poll data can never overwrite
  // a fresher realtime update (which was the root cause of the court glitch).
  useEffect(() => {
    let channel: any = null;
    let isMounted = true;
    
    const applyCloudState = (stateJson: any, updatedAt: string) => {
      if (!isMounted || !stateJson) return;
      
      // CRITICAL: Compare timestamps numerically.
      // Discard if the cloud data is older than or EQUAL to what we already rendered.
      // This eliminates redundant re-renders and animation flickering.
      if (updatedAt && lastCloudTimestamp.current) {
        const newTime = new Date(updatedAt).getTime();
        const lastTime = new Date(lastCloudTimestamp.current).getTime();
        if (!isNaN(newTime) && !isNaN(lastTime) && newTime <= lastTime) {
          return; // Identical or older data — silently discard
        }
      }
      lastCloudTimestamp.current = updatedAt || new Date().toISOString();
      
      useStore.setState({
        session: stateJson.session,
        players: stateJson.players,
        courts: stateJson.courts,
        matches: stateJson.matches
      });
      setIsLoading(false);
    };
    
    const initRealtime = async () => {
       const { createClient } = await import('@/lib/supabase');
       const supabase = createClient();
       
       if (!supabase) {
         setIsLoading(false);
         return;
       }
       
       // Initial fetch with case-insensitive match
       const { data } = await supabase
         .from('sessions')
         .select('id, state_json, is_active, updated_at, join_code')
         .ilike('join_code', code)
         .single();
       if (data && isMounted) {
         if (!data.is_active || data.state_json?.session?.isActive === false) {
           router.replace(`/history/${data.id}?playerView=true`);
           return;
         }
         applyCloudState(data.state_json, data.updated_at);
       } else if (isMounted) {
         setIsLoading(false);
       }
       
       // Subscribe to realtime changes using exact canonical code
       const canonicalCode = data?.join_code || code;
       channel = supabase.channel(`player-view-${canonicalCode}`)
         .on('postgres_changes', { 
           event: '*', 
           schema: 'public', 
           table: 'sessions', 
           filter: `join_code=eq.${canonicalCode}` 
         }, (payload: any) => {
           const newData = payload.new as any;
           if (newData && isMounted) {
             if (newData.is_active === false || newData.state_json?.session?.isActive === false) {
               router.replace(`/history/${newData.id}?playerView=true`);
               return;
             }
             if (newData?.state_json) {
               applyCloudState(newData.state_json, newData.updated_at);
             }
           }
         })
         .subscribe();

       // Polling fallback every 8 seconds — only as a safety net.
       // The timestamp check (<=) prevents it from ever re-rendering unchanged data.
       const pollInterval = setInterval(async () => {
         if (!isMounted) return;
         const { data: pollData } = await supabase
           .from('sessions')
           .select('id, state_json, is_active, updated_at')
           .ilike('join_code', code)
           .single();
         if (pollData && isMounted) {
           if (!pollData.is_active || pollData.state_json?.session?.isActive === false) {
             router.replace(`/history/${pollData.id}?playerView=true`);
             return;
           }
           applyCloudState(pollData.state_json, pollData.updated_at);
         }
       }, 8000);
       
       return () => clearInterval(pollInterval);
    };
    
    const cleanup = initRealtime();

    return () => {
       isMounted = false;
       if (channel) channel.unsubscribe();
       cleanup?.then(fn => fn?.());
    };
  }, [code, router]);

  // Redirect on end session
  useEffect(() => {
    // Check if this exact session (by join code) ended and is in local history
    const endedSession = useStore.getState().sessionHistory.find(h => h.session?.joinCode?.toUpperCase() === code);
    if (endedSession) {
      router.push(`/history/${endedSession.session.id}?playerView=true`);
      return;
    }
    // Only redirect if the session in the store is for THIS join code and it ended
    if (session && !session.isActive && session.joinCode?.toUpperCase() === code) {
      router.push(`/history/${session.id}?playerView=true`);
    }
  }, [session, router, code]);

  // Load identified player from localStorage
  useEffect(() => {
    if (session) {
      const saved = localStorage.getItem(`qqqqqq_identity_${session.id}`);
      if (saved) {
        if (saved !== 'spectator') setTimeout(() => setSelectedPlayerId(saved), 0);
      } else {
        setTimeout(() => setShowIdentifyModal(true), 0);
      }
    }
  }, [session]);

  const handleSelectIdentity = (id: string) => {
    if (id !== 'spectator') setSelectedPlayerId(id);
    localStorage.setItem(`qqqqqq_identity_${session!.id}`, id);
    setShowIdentifyModal(false);
  };

  // Monitor matches for notifications
  useEffect(() => {
    if (!selectedPlayerId || !session) return;
    
    // Find if the player is currently in an active match
    const currentMatch = matches.find(m => 
      !m.endedAtEpochMs && (m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId))
    );

    if (currentMatch && currentMatch.id !== lastMatchId.current) {
      lastMatchId.current = currentMatch.id;
      
      const isTeamA = currentMatch.teamA.includes(selectedPlayerId);
      const myTeamIds = isTeamA ? currentMatch.teamA : currentMatch.teamB;
      const oppTeamIds = isTeamA ? currentMatch.teamB : currentMatch.teamA;
      
      const partnerId = myTeamIds.find(id => id !== selectedPlayerId);
      const partner = players.find(p => p.id === partnerId)?.name || 'Unknown';
      const opponents = oppTeamIds.map(id => players.find(p => p.id === id)?.name).join(' & ');
      const court = courts.find(c => c.currentMatchId === currentMatch.id)?.label || 'A Court';

      setActiveNotification({ court, partner, opponents });

      // Trigger browser notification (wrapped in try-catch for strict mobile webviews)
      try {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification('Match Starting!', {
              body: `Head to ${court}. You are playing with ${partner} against ${opponents}.`,
            });
          } else if (Notification.permission !== 'denied') {
            const permissionPromise = Notification.requestPermission();
            if (permissionPromise && permissionPromise.then) {
              permissionPromise.then(permission => {
                if (permission === 'granted') {
                  new Notification('Match Starting!', {
                    body: `Head to ${court}. You are playing with ${partner} against ${opponents}.`,
                  });
                }
              }).catch(e => console.error(e));
            }
          }
        }
      } catch (err) {
        console.error("Browser notifications not supported or blocked in this webview", err);
      }
    }
  }, [matches, selectedPlayerId, session, players, courts]);

  const [activeAnnouncement, setActiveAnnouncement] = useState<{ text: string, ts: number } | null>(null);
  const seenAnnouncementTs = useRef<number | null>(null);

  useEffect(() => {
    if (session?.currentAnnouncement && session.announcementTimestamp) {
      if (session.announcementTimestamp !== seenAnnouncementTs.current) {
        seenAnnouncementTs.current = session.announcementTimestamp;
        setActiveAnnouncement({ text: session.currentAnnouncement, ts: session.announcementTimestamp });
        
        // Auto-dismiss after 10 seconds
        const t = setTimeout(() => setActiveAnnouncement(null), 10000);
        return () => clearTimeout(t);
      }
    }
  }, [session?.currentAnnouncement, session?.announcementTimestamp]);

  const endedSession = useStore.getState().sessionHistory.find(h => h.session?.joinCode?.toUpperCase() === code);

  if (isLoading && (!session || session.joinCode?.toUpperCase() !== code)) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <div className="glass-dark p-8 rounded-3xl text-center max-w-md w-full border border-white/10 flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <h1 className="text-xl font-bold mb-1">Loading Session...</h1>
          <p className="text-slate-400 text-sm">Connecting to session {code}</p>
        </div>
      </div>
    );
  }

  if (!session || session.joinCode?.toUpperCase() !== code) {
    if (endedSession) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div className="glass-dark p-8 rounded-3xl text-center max-w-md w-full border border-white/10">
            <h1 className="text-2xl font-bold mb-2">Session Ended</h1>
            <p className="text-slate-400">Redirecting to results...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <div className="glass-dark p-8 rounded-3xl text-center max-w-md w-full border border-white/10">
          <h1 className="text-2xl font-bold mb-2">Session Not Found</h1>
          <p className="text-slate-400">Waiting for session data or invalid code: {code}</p>
        </div>
      </div>
    );
  }

  const activeMatches = matches.filter(m => m.endedAtEpochMs == null);
  const activePlayerIds = new Set(activeMatches.flatMap(m => [...m.teamA, ...m.teamB]));

  const queuedPlayers = players
    .filter(p => (p.status === PlayerStatus.AVAILABLE || p.status === PlayerStatus.QUEUED) && !p.currentCourtId && !activePlayerIds.has(p.id))
    .sort((a, b) => {
      if (a.isLatecomer !== b.isLatecomer) return a.isLatecomer ? -1 : 1;
      return a.queuedAtEpochMs - b.queuedAtEpochMs;
    });

  // Calculate upcoming batches for player view:
  // If courts are open, calculate for available courts.
  // If all courts are full, preview the on-deck match for waiting players!
  const openCourtsCount = courts.filter(c => c.status === CourtStatus.OPEN).length;
  const batchesNeeded = openCourtsCount > 0 ? openCourtsCount : (session?.queueBatchesShown || 1);
  const upcomingBatches = queuedPlayers.length >= 4 
    ? buildNextBatches(queuedPlayers, batchesNeeded, session?.matchingMode || 'balanced', activePlayerIds).map(b => pairFour(b))
    : [];

  const activeCourts = courts.filter(c => c.status === CourtStatus.IN_PROGRESS).length;

  // Calculate matches for Games tab (loose check != null so undefined never breaks)
  const completedMatches = matches.filter(m => m.endedAtEpochMs != null);
  const inProgressMatches = matches.filter(m => m.endedAtEpochMs == null);
  const sortedCompletedMatches = [...completedMatches].sort(
    (a, b) => (b.endedAtEpochMs ?? 0) - (a.endedAtEpochMs ?? 0)
  );

  const matchNumberMap = new Map<string, number>();
  [...matches]
    .sort((a, b) => a.startedAtEpochMs - b.startedAtEpochMs)
    .forEach((m, idx) => matchNumberMap.set(m.id, idx + 1));

  const myInProgressMatches = selectedPlayerId
    ? inProgressMatches.filter(m => m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId))
    : [];

  const filteredCompletedMatches = gamesFilter === 'mine' && selectedPlayerId
    ? sortedCompletedMatches.filter(m => m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId))
    : sortedCompletedMatches;

  const formatDuration = (startedAt: number, endedAt: number | null): string => {
    if (!endedAt || endedAt < startedAt) return '< 1 min';
    const totalSeconds = Math.floor((endedAt - startedAt) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-20 relative">
      <header className="glass-dark sticky top-0 z-10 px-4 py-4 border-b border-white/10 rounded-none mb-6">
        <div className="max-w-7xl mx-auto flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black tracking-tight break-words">{session.name}</h1>
            <p className="text-emerald-400 font-mono text-sm tracking-widest uppercase flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Status
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-slate-800/80 px-4 py-2 rounded-xl flex items-center gap-2 border border-slate-700">
              <LayoutGrid size={16} className="text-blue-400" />
              <span className="font-bold">{activeCourts}/{courts.length} Active</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 mb-6">
        <div className="flex bg-slate-800 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab('queue')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all text-sm sm:text-base ${activeTab === 'queue' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
          >
            <Users size={18} /> Queue
          </button>
          <button 
            onClick={() => setActiveTab('games')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all text-sm sm:text-base ${activeTab === 'games' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
          >
            <Swords size={18} /> Games ({completedMatches.length})
            {inProgressMatches.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-extrabold rounded-full bg-emerald-500 text-white animate-pulse">
                {inProgressMatches.length} Live
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('leaderboards')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all text-sm sm:text-base ${activeTab === 'leaderboards' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
          >
            <Trophy size={18} /> Leaderboards
          </button>
        </div>
      </div>

      {activeTab === 'queue' && (
        <main className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-3xl font-black tracking-tight">Courts</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {courts.map(court => (
                <CourtCard key={court.id} court={court} readOnly={true} />
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-black tracking-tight">Queue</h2>
                <div className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 border border-blue-500/20">
                  <Users size={14} /> {queuedPlayers.length}
                </div>
              </div>
              {selectedPlayerId && (
                <button 
                  onClick={() => setShowIdentifyModal(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  Change Player
                </button>
              )}
            </div>
            <div className="glass-dark rounded-3xl p-4 min-h-[400px] border border-white/5">
              {queuedPlayers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                  <Users size={48} className="mb-4 opacity-20" />
                  <p className="font-medium">Queue is empty</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {queuedPlayers.map((player, idx) => (
                    <div key={player.id} className="flex items-center gap-4">
                      <span className="text-xl font-black text-slate-600 w-8 text-right font-mono">
                        {idx + 1}
                      </span>
                      <div className={`flex-1 ${selectedPlayerId === player.id ? 'ring-2 ring-blue-500 rounded-2xl' : ''}`}>
                        <PlayerCard player={player} compact />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {queuedPlayers.length > 0 && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-4 px-2 text-center italic border-t border-white/5 pt-3 leading-tight">
                  * Queue shows priority order. Exact call-ups may vary slightly to balance skill matchups and partner locks.
                </p>
              )}
            </div>
          </div>

          {/* Next Up Section */}
          {(session.showNextUpToPlayers ?? true) && upcomingBatches.length > 0 && (
            <div className="lg:col-span-3 space-y-4 mt-4">
              <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 flex-wrap">
                <span className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center text-amber-400">⚡</span>
                Next Up
                {openCourtsCount === 0 && (
                  <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                    On Deck (Next Court Available)
                  </span>
                )}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcomingBatches.map((batch, idx) => (
                  <div key={idx} className="glass-dark rounded-2xl p-4 border border-white/5">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Match {idx + 1}</div>
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        {batch.teamA.map(p => (
                          <div key={p.id} className={`text-sm font-semibold px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20 ${selectedPlayerId === p.id ? 'ring-2 ring-blue-400' : ''}`}>
                            {p.name}
                          </div>
                        ))}
                      </div>
                      <div className="text-center text-xs font-bold text-slate-500">VS</div>
                      <div className="flex flex-col gap-1">
                        {batch.teamB.map(p => (
                          <div key={p.id} className={`text-sm font-semibold px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 ${selectedPlayerId === p.id ? 'ring-2 ring-rose-400' : ''}`}>
                            {p.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}

      {activeTab === 'games' && (
        <main className="max-w-7xl mx-auto px-4 space-y-6">
          <div className="glass-dark rounded-3xl p-6 border border-white/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Swords size={22} />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight">Session Games</h2>
                  <p className="text-xs text-slate-400">
                    {completedMatches.length} completed {inProgressMatches.length > 0 ? `• ${inProgressMatches.length} live on courts` : ''}
                  </p>
                </div>
              </div>

              {selectedPlayerId && (
                <div className="flex bg-slate-800 p-1 rounded-xl self-start sm:self-auto">
                  <button
                    onClick={() => setGamesFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${gamesFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    All Games ({completedMatches.length})
                  </button>
                  <button
                    onClick={() => setGamesFilter('mine')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${gamesFilter === 'mine' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    My Games ({completedMatches.filter(m => m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId)).length})
                  </button>
                </div>
              )}
            </div>

            {/* In-Progress Live Games */}
            {gamesFilter === 'all' && inProgressMatches.length > 0 && (
              <div className="mb-6 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                  Currently Playing on Courts
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {inProgressMatches.map(m => {
                    const court = courts.find(c => c.id === m.courtId);
                    const courtName = m.courtLabel || court?.label || 'Court';
                    const teamAPlayers = m.teamA.map(id => players.find(p => p.id === id)).filter(Boolean);
                    const teamBPlayers = m.teamB.map(id => players.find(p => p.id === id)).filter(Boolean);
                    const isMyMatch = selectedPlayerId && (m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId));

                    return (
                      <div key={m.id} className={`bg-slate-800/80 rounded-2xl p-4 border ${isMyMatch ? 'border-blue-500 shadow-md shadow-blue-500/10' : 'border-slate-700'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                            {courtName}
                          </span>
                          <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Live Now
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex-1 font-semibold text-slate-200">
                            {teamAPlayers.map(p => p?.name).join(' & ')}
                          </div>
                          <span className="text-xs font-bold text-slate-500">VS</span>
                          <div className="flex-1 font-semibold text-slate-200 text-right">
                            {teamBPlayers.map(p => p?.name).join(' & ')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* In-Progress Live Games for My Games */}
            {gamesFilter === 'mine' && myInProgressMatches.length > 0 && (
              <div className="mb-6 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Your Current Live Match
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myInProgressMatches.map(m => {
                    const court = courts.find(c => c.id === m.courtId);
                    const courtName = m.courtLabel || court?.label || 'Court';
                    const teamAPlayers = m.teamA.map(id => players.find(p => p.id === id)).filter(Boolean);
                    const teamBPlayers = m.teamB.map(id => players.find(p => p.id === id)).filter(Boolean);

                    return (
                      <div key={m.id} className="bg-blue-950/40 rounded-2xl p-4 border border-blue-500 shadow-md shadow-blue-500/10">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                            {courtName}
                          </span>
                          <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Playing Now
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex-1 font-semibold text-slate-200">
                            {teamAPlayers.map(p => p?.name).join(' & ')}
                          </div>
                          <span className="text-xs font-bold text-slate-500">VS</span>
                          <div className="flex-1 font-semibold text-slate-200 text-right">
                            {teamBPlayers.map(p => p?.name).join(' & ')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredCompletedMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Swords size={48} className="mb-4 opacity-20" />
                <p className="font-medium text-base">
                  {gamesFilter === 'mine' 
                    ? (myInProgressMatches.length > 0 ? "No completed matches yet. Your live match is shown above." : "You haven't played any completed matches yet") 
                    : "No matches completed yet"}
                </p>
                <p className="text-xs text-slate-400 mt-1">Finished games will show up here automatically</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCompletedMatches.map((match) => {
                  const matchNumber = matchNumberMap.get(match.id) ?? 1;
                  const court = courts.find(c => c.id === match.courtId);
                  const courtName = match.courtLabel || court?.label || 'Court';
                  const teamAPlayers = match.teamA.map(id => players.find(p => p.id === id)).filter(Boolean);
                  const teamBPlayers = match.teamB.map(id => players.find(p => p.id === id)).filter(Boolean);
                  const isWinnerA = (match.winner as string) === Team.A || (match.winner as string) === 'A';
                  const isWinnerB = (match.winner as string) === Team.B || (match.winner as string) === 'B';
                  const isMyMatch = selectedPlayerId && (match.teamA.includes(selectedPlayerId) || match.teamB.includes(selectedPlayerId));
                  const myTeamWon = selectedPlayerId && ((match.teamA.includes(selectedPlayerId) && isWinnerA) || (match.teamB.includes(selectedPlayerId) && isWinnerB));
                  const duration = formatDuration(match.startedAtEpochMs, match.endedAtEpochMs);
                  const endTime = match.endedAtEpochMs ? new Date(match.endedAtEpochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                  return (
                    <div
                      key={match.id}
                      className={`bg-slate-800/60 rounded-2xl border p-4 transition-all ${
                        isMyMatch ? 'border-blue-500/60 bg-blue-950/20 shadow-md shadow-blue-500/5' : 'border-slate-700/60'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-white/5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                            Match #{matchNumber}
                          </span>
                          <span className="text-slate-400 font-medium">
                            {courtName}
                          </span>
                          {isMyMatch && (
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              myTeamWon ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700 text-slate-300'
                            }`}>
                              {myTeamWon ? '🏆 Victory' : 'Played'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock size={12} /> {duration}
                          </span>
                          {endTime && <span>{endTime}</span>}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Team A */}
                        <div className={`p-3 rounded-xl border ${
                          isWinnerA ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900/40 border-white/5'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Team 1</span>
                            {isWinnerA && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white flex items-center gap-1">
                                <Trophy size={10} /> Winner
                              </span>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {teamAPlayers.map((p, idx) => (
                              <div key={p?.id || idx} className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {p?.photoUrl ? (
                                    <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover rounded-full" />
                                  ) : (
                                    (p?.name || '??').substring(0, 2).toUpperCase()
                                  )}
                                </div>
                                <span className={`text-sm font-semibold truncate ${
                                  selectedPlayerId === p?.id ? 'text-blue-300 font-bold underline' : 'text-slate-200'
                                }`}>
                                  {p?.name || 'Player'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Team B */}
                        <div className={`p-3 rounded-xl border ${
                          isWinnerB ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900/40 border-white/5'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Team 2</span>
                            {isWinnerB && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white flex items-center gap-1">
                                <Trophy size={10} /> Winner
                              </span>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {teamBPlayers.map((p, idx) => (
                              <div key={p?.id || idx} className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-r from-rose-500 to-orange-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {p?.photoUrl ? (
                                    <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover rounded-full" />
                                  ) : (
                                    (p?.name || '??').substring(0, 2).toUpperCase()
                                  )}
                                </div>
                                <span className={`text-sm font-semibold truncate ${
                                  selectedPlayerId === p?.id ? 'text-blue-300 font-bold underline' : 'text-slate-200'
                                }`}>
                                  {p?.name || 'Player'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      )}

      {activeTab === 'leaderboards' && (
        <main className="max-w-7xl mx-auto px-4">
          <div className="glass-dark rounded-3xl p-6 border border-white/5">
            <h2 className="text-2xl font-black tracking-tight mb-6 flex items-center gap-3">
              <Trophy className="text-amber-400" />
              Session Leaderboard
            </h2>
            
            {players.filter(p => p.sessionGamesPlayed > 0).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                <Trophy size={48} className="mb-4 opacity-20" />
                <p className="font-medium">No matches completed yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {[...players]
                  .filter(p => p.sessionGamesPlayed > 0)
                  .sort((a, b) => {
                    if (b.sessionWins !== a.sessionWins) return b.sessionWins - a.sessionWins;
                    const winPctA = a.sessionWins / a.sessionGamesPlayed;
                    const winPctB = b.sessionWins / b.sessionGamesPlayed;
                    if (winPctB !== winPctA) return winPctB - winPctA;
                    return b.sessionGamesPlayed - a.sessionGamesPlayed;
                  })
                  .map((player, idx) => {
                  const winPct = ((player.sessionWins / player.sessionGamesPlayed) * 100).toFixed(0);
                  return (
                    <div key={player.id} className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                      <div className="text-2xl font-black text-slate-500 w-8 text-center font-mono">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg text-slate-100 truncate">{player.name}</h3>
                        <p className="text-sm text-slate-400 uppercase tracking-widest mt-0.5">Level {player.skillLevel}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-black text-emerald-400">
                          {winPct}%
                        </div>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                          {player.sessionWins}W - {player.sessionLosses}L
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      )}

      {/* Identity Selection Modal */}
      {showIdentifyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full animate-slide-up shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-2">Who are you?</h3>
            <p className="text-slate-400 text-sm mb-6">Select your name to receive live match notifications.</p>
            
            <div className="max-h-80 overflow-y-auto space-y-2 mb-6 pr-2">
              {players.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectIdentity(p.id)}
                  className="w-full text-left p-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700 hover:border-slate-500"
                >
                  <div className="font-bold text-lg">{p.name}</div>
                  <div className="text-xs text-slate-400 uppercase tracking-widest mt-1">Level {p.skillLevel}</div>
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => handleSelectIdentity('spectator')}
              className="w-full py-3 text-slate-400 font-medium hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              Continue as Spectator
            </button>
          </div>
        </div>
      )}

      {/* Live Match Notification Toast */}
      {activeNotification && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-slide-up w-[90%] max-w-md">
          <div className="bg-emerald-500 text-white p-6 rounded-3xl shadow-2xl flex flex-col items-center text-center gap-4 border border-emerald-400/50">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <Bell size={32} className="animate-bounce" />
            </div>
            <div>
              <h3 className="text-2xl font-black mb-1">Match Started!</h3>
              <p className="font-medium text-emerald-50">Head to <strong className="text-white text-lg">{activeNotification.court}</strong></p>
            </div>
            <div className="w-full bg-black/10 rounded-2xl p-4 mt-2">
              <div className="text-sm font-semibold uppercase tracking-widest text-emerald-100 mb-1">Partner</div>
              <div className="font-bold text-lg mb-3">{activeNotification.partner}</div>
              
              <div className="text-sm font-semibold uppercase tracking-widest text-emerald-100 mb-1">Opponents</div>
              <div className="font-bold text-lg">{activeNotification.opponents}</div>
            </div>
            <button 
              onClick={() => setActiveNotification(null)}
              className="w-full mt-2 py-4 bg-white text-emerald-600 font-bold text-lg rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors shadow-sm"
            >
              <CheckCircle size={20} /> I&apos;m on my way
            </button>
          </div>
        </div>
      )}

      {/* Organizer Announcement Toast */}
      {activeAnnouncement && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 animate-slide-up w-[90%] max-w-md">
          <div className="bg-indigo-600 text-white p-6 rounded-3xl shadow-2xl flex flex-col items-center text-center gap-4 border border-indigo-400/50 relative">
            <button onClick={() => setActiveAnnouncement(null)} className="absolute top-4 right-4 text-indigo-200 hover:text-white">
              &times;
            </button>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Megaphone size={24} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl font-black mb-1">Announcement</h3>
              <p className="font-medium text-lg leading-relaxed">{activeAnnouncement.text}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
