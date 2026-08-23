'use client';

import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { CourtStatus, PlayerStatus } from '@/types/models';
import { PlayerCard } from '@/components/ui/PlayerCard';
import { CourtCard } from '@/components/ui/CourtCard';
import { Users, LayoutGrid, Bell, CheckCircle, Megaphone } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

export default function PlayerMonitorPage() {
  const { code } = useParams();
  const router = useRouter();
  const { session, courts, players, matches } = useStore();
  
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showIdentifyModal, setShowIdentifyModal] = useState(false);
  const [activeNotification, setActiveNotification] = useState<{court: string, partner: string, opponents: string} | null>(null);
  
  const lastMatchId = useRef<string | null>(null);

  // Cloud Sync & Cross-tab synchronization
  useEffect(() => {
    let channel: any = null;
    const handleStorageChange = () => {
      useStore.persist.rehydrate();
    };
    
    const initRealtime = async () => {
       const { createClient } = await import('@/lib/supabase');
       const supabase = createClient();
       
       if (supabase) {
         // Subscribe to Postgres changes on the sessions table for this specific join_code
         channel = supabase.channel(`public:sessions:join_code=eq.${code}`)
           .on('postgres_changes', { 
             event: '*', 
             schema: 'public', 
             table: 'sessions', 
             filter: `join_code=eq.${code}` 
           }, (payload) => {
             const newData = payload.new as any;
             if (newData && newData.state_json) {
               // Hydrate the store with the cloud state
               useStore.setState({
                 session: newData.state_json.session,
                 players: newData.state_json.players,
                 courts: newData.state_json.courts,
                 matches: newData.state_json.matches
               });
             }
           })
           .subscribe();
           
         // Initial fetch just in case they loaded before the first broadcast
         const { data } = await supabase.from('sessions').select('state_json').eq('join_code', code).single();
         if (data && data.state_json) {
            useStore.setState({
               session: data.state_json.session,
               players: data.state_json.players,
               courts: data.state_json.courts,
               matches: data.state_json.matches
            });
         }
       } else {
         // Fallback to local cross-tab if Supabase isn't configured
         window.addEventListener('storage', handleStorageChange);
       }
    };
    
    initRealtime();

    return () => {
       window.removeEventListener('storage', handleStorageChange);
       if (channel) channel.unsubscribe();
    };
  }, [code]);

  // Redirect on end session
  useEffect(() => {
    // Check if the current session ended (it would be moved to history)
    const endedSession = useStore.getState().sessionHistory.find(h => h.session.joinCode === code);
    if (endedSession) {
      router.push(`/history/${endedSession.session.id}?playerView=true`);
    } else if (session && !session.isActive) {
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

  useEffect(() => {
    if (session?.currentAnnouncement && session.announcementTimestamp) {
      if (!activeAnnouncement || activeAnnouncement.ts !== session.announcementTimestamp) {
        setActiveAnnouncement({ text: session.currentAnnouncement, ts: session.announcementTimestamp });
        
        // Auto-dismiss after 10 seconds
        const t = setTimeout(() => setActiveAnnouncement(null), 10000);
        return () => clearTimeout(t);
      }
    }
  }, [session?.currentAnnouncement, session?.announcementTimestamp, activeAnnouncement]);

  const endedSession = useStore.getState().sessionHistory.find(h => h.session.joinCode === code);

  if (!session || session.joinCode !== code) {
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
          <p className="text-slate-400">Waiting for session data or invalid code.</p>
        </div>
      </div>
    );
  }

  const queuedPlayers = players
    .filter(p => p.status === PlayerStatus.AVAILABLE || p.status === PlayerStatus.QUEUED)
    .sort((a, b) => {
      if (a.isLatecomer !== b.isLatecomer) return a.isLatecomer ? -1 : 1;
      return a.queuedAtEpochMs - b.queuedAtEpochMs;
    });

  const activeCourts = courts.filter(c => c.status === CourtStatus.IN_PROGRESS).length;

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
          </div>
        </div>
      </main>

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
