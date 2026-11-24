'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { CourtStatus, PlayerStatus, Team, Session, Player, Court, Match, TournamentMatch } from '@/types/models';
import { PlayerCard } from '@/components/ui/PlayerCard';
import { CourtCard } from '@/components/ui/CourtCard';
import { BracketTree } from '@/components/ui/BracketTree';
import { TournamentLeaderboard } from '@/components/ui/TournamentLeaderboard';
import { Users, LayoutGrid, Bell, CheckCircle, Megaphone, Trophy, Swords, Clock, GitMerge, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { buildNextBatches, priorityOrder } from '@/engine/queue-engine';
import { pairFour } from '@/engine/pairing-engine';
import { getInitials } from '@/utils/initials';
import { getSortedPlayers } from '@/utils/leaderboard';

interface CloudSessionState {
  session: Session | null;
  players: Player[];
  courts: Court[];
  matches: Match[];
}

interface CloudSessionRow {
  id?: string;
  join_code?: string;
  is_active?: boolean;
  updated_at?: string;
  state_json?: CloudSessionState | null;
}

interface DisplayMatchItem {
  id: string;
  courtId: string;
  courtLabel?: string;
  roundGroupKey?: string;
  roundGroupLabel?: string;
  roundGroupSort?: number;
  teamA: string[];
  teamB: string[];
  teamAId?: string | null;
  teamBId?: string | null;
  startedAtEpochMs: number;
  endedAtEpochMs: number | null;
  winner: Team | string | null;
  status?: TournamentMatch['status'];
  scoreA?: number | null;
  scoreB?: number | null;
  isBestOf3?: boolean;
  games?: { winnerId: string; scoreA: number; scoreB: number }[];
  teamAName?: string | null;
  teamBName?: string | null;
}

export default function PlayerMonitorPage() {
  const params = useParams();
  const rawCode = params?.code;
  const code = (typeof rawCode === 'string' ? rawCode : Array.isArray(rawCode) ? rawCode[0] : '').toUpperCase();
  const router = useRouter();
  const { session, courts, players, matches } = useStore();
  
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [identitySearch, setIdentitySearch] = useState('');
  const [showIdentifyModal, setShowIdentifyModal] = useState(false);
  const [activeNotification, setActiveNotification] = useState<{court: string, partner: string, opponents: string} | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const lastMatchId = useRef<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'queue' | 'games' | 'leaderboards' | 'tournament'>('queue');
  const [hasUserPickedTab, setHasUserPickedTab] = useState(false);
  const [gamesFilter, setGamesFilter] = useState<'all' | 'mine'>('all');
  const [expandedRoundGroups, setExpandedRoundGroups] = useState<Record<string, boolean>>({});

  const isPoolPlayPhase = Boolean(
    session?.sessionType && session.sessionType !== 'OPEN_PLAY' && session.tournamentState?.phase === 'POOL_PLAY'
  );
  const isTournamentSession = Boolean(session?.sessionType && session.sessionType !== 'OPEN_PLAY');
  const effectiveActiveTab: 'queue' | 'games' | 'leaderboards' | 'tournament' = hasUserPickedTab
    ? activeTab
    : (isPoolPlayPhase ? 'games' : (isTournamentSession ? 'tournament' : activeTab));

  const handleTabChange = (tab: 'queue' | 'games' | 'leaderboards' | 'tournament') => {
    setHasUserPickedTab(true);
    setActiveTab(tab);
  };

  // Track the latest cloud timestamp to NEVER allow stale data to overwrite newer data
  const lastCloudTimestamp = useRef<string>('');

  // Cloud Sync for Player View — this is the single source of truth.
  // We track updated_at timestamps so that stale poll data can never overwrite
  // a fresher realtime update (which was the root cause of the court glitch).
  useEffect(() => {
    let channel: { unsubscribe: () => void } | null = null;
    let isMounted = true;
    
    const applyCloudState = (stateJson: CloudSessionState | null | undefined, updatedAt: string) => {
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
         .maybeSingle();
       if (data && isMounted) {
         if (!data.is_active || data.state_json?.session?.isActive === false) {
           router.replace(`/history/${data.id}?playerView=true`);
           return;
         }
         applyCloudState(data.state_json as CloudSessionState, data.updated_at);
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
         }, (payload: { new?: unknown }) => {
           const newData = payload.new as CloudSessionRow | undefined;
           if (newData && isMounted) {
             if (newData.is_active === false || newData.state_json?.session?.isActive === false) {
               router.replace(`/history/${newData.id}?playerView=true`);
               return;
             }
             if (newData?.state_json) {
               applyCloudState(newData.state_json, newData.updated_at || '');
             }
           }
         })
         .subscribe();

       // Polling fallback every 4 seconds — only as a safety net.
       // The timestamp check (<=) prevents it from ever re-rendering unchanged data.
       const pollInterval = setInterval(async () => {
         if (!isMounted) return;
         const { data: pollData } = await supabase
           .from('sessions')
           .select('id, state_json, is_active, updated_at')
           .ilike('join_code', code)
           .maybeSingle();
         if (pollData && isMounted) {
           if (!pollData.is_active || pollData.state_json?.session?.isActive === false) {
             router.replace(`/history/${pollData.id}?playerView=true`);
             return;
           }
           applyCloudState(pollData.state_json, pollData.updated_at);
         }
       }, 4000);
       
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
    setSelectedPlayerId(id === 'spectator' ? null : id);
    localStorage.setItem(`qqqqqq_identity_${session!.id}`, id);
    setIdentitySearch('');
    setShowIdentifyModal(false);
  };

  // Monitor matches for notifications
  useEffect(() => {
    if (!selectedPlayerId || !session) return;
    
    // Find if the player is currently in an active match
    const currentMatch = matches.find(m => 
      !m.endedAtEpochMs && (m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId))
    );

    let matchId: string | null = null;
    let court = '';
    let partner = 'Unknown';
    let opponents = 'Unknown';

    if (currentMatch) {
      matchId = currentMatch.id;
      const isTeamA = currentMatch.teamA.includes(selectedPlayerId);
      const myTeamIds = isTeamA ? currentMatch.teamA : currentMatch.teamB;
      const oppTeamIds = isTeamA ? currentMatch.teamB : currentMatch.teamA;
      
      const partnerId = myTeamIds.find(id => id !== selectedPlayerId);
      partner = players.find(p => p.id === partnerId)?.name || 'Unknown';
      opponents = oppTeamIds.map(id => players.find(p => p.id === id)?.name).filter(Boolean).join(' & ') || 'Opponents';
      court = courts.find(c => c.currentMatchId === currentMatch.id)?.label || 'A Court';
    } else if (session.tournamentState?.matches) {
      // Also search session.tournamentState.matches for the player's team
      const tState = session.tournamentState;
      const activeTourneyMatch = tState.matches.find(tm => {
        if (tm.endedAtEpochMs != null) return false;
        const hasAssignedCourt = Boolean(tm.courtId) || courts.some(c => c.currentMatchId === tm.id);
        if (tm.status !== 'IN_PROGRESS' && !(tm.status === 'READY' && hasAssignedCourt)) return false;
        const pairA = tState.pairs.find(p => p.id === tm.teamAId);
        const pairB = tState.pairs.find(p => p.id === tm.teamBId);
        const inA = pairA ? (pairA.player1Id === selectedPlayerId || pairA.player2Id === selectedPlayerId) : false;
        const inB = pairB ? (pairB.player1Id === selectedPlayerId || pairB.player2Id === selectedPlayerId) : false;
        return inA || inB;
      });

      if (activeTourneyMatch) {
        matchId = activeTourneyMatch.id;
        const pairA = tState.pairs.find(p => p.id === activeTourneyMatch.teamAId);
        const pairB = tState.pairs.find(p => p.id === activeTourneyMatch.teamBId);
        const inA = pairA ? (pairA.player1Id === selectedPlayerId || pairA.player2Id === selectedPlayerId) : false;
        const myPair = inA ? pairA : pairB;
        const oppPair = inA ? pairB : pairA;

        const partnerId = myPair ? (myPair.player1Id === selectedPlayerId ? myPair.player2Id : myPair.player1Id) : null;
        partner = players.find(p => p.id === partnerId)?.name || 'Unknown';

        const pOpp1 = players.find(p => p.id === oppPair?.player1Id)?.name;
        const pOpp2 = players.find(p => p.id === oppPair?.player2Id)?.name;
        opponents = oppPair?.name || [pOpp1, pOpp2].filter(Boolean).join(' & ') || 'Opponents';
        court = courts.find(c => c.id === activeTourneyMatch.courtId || c.currentMatchId === activeTourneyMatch.id)?.label || 'Tournament Court';
      }
    }

    if (matchId && matchId !== lastMatchId.current) {
      lastMatchId.current = matchId;
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
  }, [matches, selectedPlayerId, session, players, courts, session?.tournamentState?.matches]);

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
      <div className="dark min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="glass-dark p-8 rounded-3xl text-center max-w-md w-full border border-white/10 flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
          <h1 className="text-xl font-bold mb-1">Loading Session...</h1>
          <p className="text-slate-400 text-sm">Connecting to session {code}</p>
        </div>
      </div>
    );
  }

  if (!session || session.joinCode?.toUpperCase() !== code) {
    if (endedSession) {
      return (
        <div className="dark min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
          <div className="glass-dark p-8 rounded-3xl text-center max-w-md w-full border border-white/10">
            <h1 className="text-2xl font-bold mb-2">Session Ended</h1>
            <p className="text-slate-400">Redirecting to results...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="dark min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="glass-dark p-8 rounded-3xl text-center max-w-md w-full border border-white/10 space-y-4">
          <h1 className="text-2xl font-bold mb-2">Session Not Found</h1>
          <p className="text-slate-400">No active session found for code: <span className="font-mono font-bold text-white">{code}</span></p>
          <div className="flex flex-col gap-3 pt-2">
            <Link
              href="/"
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-colors duration-150 inline-flex items-center justify-center gap-2"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeMatches = matches.filter(m => m.endedAtEpochMs == null);
  const activePlayerIds = new Set(activeMatches.flatMap(m => [...m.teamA, ...m.teamB]));

  const queuedPlayers = priorityOrder(
    players.filter(p => (p.status === PlayerStatus.AVAILABLE || p.status === PlayerStatus.QUEUED) && !p.currentCourtId && !activePlayerIds.has(p.id))
  );

  // Calculate upcoming batches for player view:
  // If courts are open, calculate for available courts.
  // If all courts are full, preview the on-deck match for waiting players!
  const openCourtsCount = courts.filter(c => c.status === CourtStatus.OPEN).length;
  const batchesNeeded = openCourtsCount > 0 ? openCourtsCount : (session?.queueBatchesShown || 1);
  const rawUpcomingBatches = queuedPlayers.length >= 4 
    ? buildNextBatches(queuedPlayers, batchesNeeded, session?.matchingMode || 'balanced', activePlayerIds).map(b => pairFour(b))
    : [];
  const upcomingBatches = (() => {
    const customBatches = session?.customBatches;
    if (!customBatches || customBatches.length === 0 || rawUpcomingBatches.length === 0) {
      return rawUpcomingBatches;
    }
    const eligibleMap = new Map(queuedPlayers.map(p => [p.id, p]));
    const claimedIds = new Set<string>();
    return rawUpcomingBatches.map((defaultBatch, idx) => {
      const cb = customBatches[idx];
      if (cb && cb.teamA.length === 2 && cb.teamB.length === 2) {
        const ids = [...cb.teamA, ...cb.teamB];
        const unique = new Set(ids);
        if (unique.size === 4 && ids.every(id => eligibleMap.has(id) && !claimedIds.has(id))) {
          ids.forEach(id => claimedIds.add(id));
          return {
            teamA: cb.teamA.map(id => eligibleMap.get(id)!),
            teamB: cb.teamB.map(id => eligibleMap.get(id)!)
          };
        }
      }
      return defaultBatch;
    });
  })();

  const activeCourts = courts.filter(c => c.status === CourtStatus.IN_PROGRESS).length;

  // Calculate matches for Games tab (loose check != null so undefined never breaks)
  let displayMatches: DisplayMatchItem[] = matches.map(m => ({ ...m }));
  const isTournament = session?.sessionType && session.sessionType !== 'OPEN_PLAY' && session.tournamentState;

  if (isTournament) {
    const tState = session.tournamentState!;
    displayMatches = tState.matches.filter(tm => 
      tm.teamAId && tm.teamBId // Include all matches with assigned teams (scheduled, in-progress, completed)
    ).map(tm => {
      const pairA = tState.pairs.find(p => p.id === tm.teamAId);
      const pairB = tState.pairs.find(p => p.id === tm.teamBId);
      
      const teamA = pairA ? [pairA.player1Id, pairA.player2Id] : [];
      const teamB = pairB ? [pairB.player1Id, pairB.player2Id] : [];
      
      // Calculate round name and collapsible group metadata
      let courtLabel = '';
      let roundGroupKey = 'other';
      let roundGroupLabel = 'Matches';
      let roundGroupSort = 0;

      if (tm.id.startsWith('pool_match_')) {
        courtLabel = `Pool Round ${tm.round}`;
        roundGroupKey = `pool_r${tm.round}`;
        roundGroupLabel = `Pool Round ${tm.round}`;
        roundGroupSort = tm.round;
      } else if (tm.id.startsWith('pool_tiebreaker_')) {
        courtLabel = 'Cutline Tiebreaker';
        roundGroupKey = 'pool_tb';
        roundGroupLabel = 'Cutline Tiebreakers';
        roundGroupSort = 50;
      } else if (tm.id.startsWith('chaos_')) {
        courtLabel = `Chaos Round ${tm.round}`;
        roundGroupKey = `chaos_r${tm.round}`;
        roundGroupLabel = `Chaos Round ${tm.round}`;
        roundGroupSort = 100 + tm.round;
      } else if (tm.id.startsWith('gf_')) {
        courtLabel = tm.id.startsWith('gf_reset_') ? 'Bracket Reset Final' : 'Grand Finals';
        roundGroupKey = 'gf';
        roundGroupLabel = 'Grand Finals';
        roundGroupSort = 900 + tm.round;
      } else if (tm.is3rdPlaceMatch || tm.id.startsWith('3rd_place_')) {
        courtLabel = '3rd Place Match';
        roundGroupKey = 'bronze';
        roundGroupLabel = '3rd Place Match';
        roundGroupSort = 850;
      } else {
        const matchesInThisRound = tState.matches.filter(
          m => m.round === tm.round && m.isLosersBracket === tm.isLosersBracket && !m.id.startsWith('pool_') && !m.id.startsWith('gf_') && !m.is3rdPlaceMatch && !m.id.startsWith('3rd_place_')
        );
        const matchCount = matchesInThisRound.length;
        if (tm.isLosersBracket) {
          const maxLbRound = Math.max(0, ...tState.matches.filter(m => m.isLosersBracket).map(m => m.round));
          if (tm.round === maxLbRound && matchCount === 1) courtLabel = 'Lower Bracket Final';
          else if (tm.round === maxLbRound - 1 && matchCount === 1) courtLabel = 'Lower Bracket Semifinal';
          else courtLabel = `Lower Bracket R${tm.round}`;
          roundGroupKey = `lb_r${tm.round}`;
          roundGroupLabel = courtLabel;
          roundGroupSort = 500 + tm.round;
        } else {
          if (matchCount === 1) courtLabel = 'Championship';
          else if (matchCount === 2) courtLabel = 'Semifinals';
          else if (matchCount >= 3 && matchCount <= 4) courtLabel = 'Quarterfinals';
          else if (matchCount >= 5 && matchCount <= 8) courtLabel = 'Round of 16';
          else if (matchCount >= 9 && matchCount <= 16) courtLabel = 'Round of 32';
          else courtLabel = `Bracket R${tm.round}`;
          roundGroupKey = `ub_r${tm.round}`;
          roundGroupLabel = courtLabel;
          roundGroupSort = 200 + tm.round;
        }
      }
      
      if (tm.isBestOf3) {
        courtLabel += ' (BO3)';
      }
        
      let winner = null;
      if (tm.winnerTeamId === tm.teamAId) winner = 'A';
      else if (tm.winnerTeamId === tm.teamBId) winner = 'B';
      
      return {
        id: tm.id,
        courtId: tm.courtId || '',
        courtLabel,
        roundGroupKey,
        roundGroupLabel,
        roundGroupSort,
        teamA,
        teamB,
        teamAId: tm.teamAId,
        teamBId: tm.teamBId,
        startedAtEpochMs: tm.startedAtEpochMs || 0,
        endedAtEpochMs: tm.endedAtEpochMs,
        winner,
        status: tm.status,
        scoreA: tm.scoreA,
        scoreB: tm.scoreB,
        isBestOf3: tm.isBestOf3,
        games: tm.games,
        teamAName: pairA?.name || null,
        teamBName: pairB?.name || null,
      };
    });
  }

  const completedMatches = displayMatches.filter(m => m.status === 'COMPLETED' || (m.status == null && m.endedAtEpochMs != null));
  const inProgressMatches = displayMatches.filter(m => m.status === 'IN_PROGRESS' || (m.status == null && m.endedAtEpochMs == null));
  const pendingMatches = displayMatches.filter(m => m.status === 'PENDING' || m.status === 'READY');
  const sortedCompletedMatches = [...completedMatches].sort(
    (a, b) => (b.endedAtEpochMs ?? 0) - (a.endedAtEpochMs ?? 0)
  );

  const matchNumberMap = new Map<string, number>();
  [...displayMatches]
    .sort((a, b) => a.startedAtEpochMs - b.startedAtEpochMs)
    .forEach((m, idx) => matchNumberMap.set(m.id, idx + 1));

  const myInProgressMatches = selectedPlayerId
    ? inProgressMatches.filter(m => m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId))
    : [];

  const myPendingMatches = selectedPlayerId
    ? pendingMatches.filter(m => m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId))
    : [];

  const filteredCompletedMatches = gamesFilter === 'mine' && selectedPlayerId
    ? sortedCompletedMatches.filter(m => m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId))
    : sortedCompletedMatches;

  const formatDuration = (startedAt: number, endedAt: number | null): string => {
    if (!startedAt || startedAt <= 0 || !endedAt || endedAt < startedAt) return '< 1 min';
    const totalSeconds = Math.floor((endedAt - startedAt) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
  };

  const renderLiveGamesPills = (m: DisplayMatchItem) => {
    if (!m.games || m.games.length === 0) return null;
    const seriesA = m.games.filter(g => (m.teamAId ? g.winnerId === m.teamAId : g.scoreA > g.scoreB)).length;
    const seriesB = m.games.filter(g => (m.teamBId ? g.winnerId === m.teamBId : g.scoreB > g.scoreA)).length;
    return (
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-mono tabular-nums">
        {m.isBestOf3 && (
          <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40 font-bold">
            Series: {seriesA}-{seriesB}
          </span>
        )}
        {m.games.map((g, i) => (
          <span key={i} className="bg-slate-900/50 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
            G{i + 1}: {g.scoreA}-{g.scoreB}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="dark min-h-screen bg-slate-950 text-slate-100 pb-20 relative">
      <header className="bg-slate-900/95 backdrop-blur-md sm:sticky sm:top-0 z-20 px-4 py-3 border-b border-white/10 rounded-none mb-6 shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight break-words line-clamp-2">{session.name}</h1>
            <p className="text-emerald-400 font-mono text-xs sm:text-sm tracking-widest uppercase flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Status
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
            <div className="bg-slate-800/80 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl flex items-center gap-2 border border-slate-700 text-xs sm:text-sm tabular-nums">
              <LayoutGrid size={15} className="text-emerald-400" />
              <span className="font-bold">{activeCourts}/{courts.length} Active</span>
            </div>
            <button
              type="button"
              onClick={() => setShowIdentifyModal(true)}
              className="text-xs font-semibold text-emerald-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              {selectedPlayerId ? 'Change Player' : 'Select Player'}
            </button>
          </div>
        </div>
      </header>

      {session.sessionType && session.sessionType !== 'OPEN_PLAY' && !session.tournamentState && (
        <div className="max-w-7xl mx-auto px-4 mb-6">
          <div className="bg-emerald-600/20 border border-emerald-500/40 rounded-2xl p-6 text-center text-emerald-200 space-y-2">
            <Trophy size={36} className="mx-auto text-emerald-400 animate-pulse" />
            <h3 className="text-xl font-bold text-white">Waiting for Tournament to Start</h3>
            <p className="text-sm text-slate-300 max-w-md mx-auto">
              The tournament has been announced! The organizer will generate the match bracket shortly.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 mb-6">
        <div className="flex bg-slate-800 p-1 rounded-2xl overflow-x-auto hide-scrollbar" role="tablist">
          {(!session.sessionType || session.sessionType === 'OPEN_PLAY') && (
            <button 
              role="tab"
              aria-selected={effectiveActiveTab === 'queue'}
              data-active={effectiveActiveTab === 'queue' ? 'true' : 'false'}
              onClick={() => handleTabChange('queue')}
              className={`flex-1 min-w-[96px] flex items-center justify-center gap-1.5 py-2.5 sm:py-3 rounded-xl font-bold transition-colors duration-150 text-xs sm:text-base ${effectiveActiveTab === 'queue' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
            >
              <Users size={17} /> Queue
            </button>
          )}
          
          {session.sessionType && session.sessionType !== 'OPEN_PLAY' && (
            <button 
              role="tab"
              aria-selected={effectiveActiveTab === 'tournament' || effectiveActiveTab === 'queue'}
              data-active={(effectiveActiveTab === 'tournament' || effectiveActiveTab === 'queue') ? 'true' : 'false'}
              onClick={() => handleTabChange('tournament')}
              className={`flex-1 min-w-[96px] flex items-center justify-center gap-1.5 py-2.5 sm:py-3 rounded-xl font-bold transition-colors duration-150 text-xs sm:text-base ${(effectiveActiveTab === 'tournament' || effectiveActiveTab === 'queue') ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
            >
              <GitMerge size={17} /> Bracket
            </button>
          )}

          <button 
            role="tab"
            aria-selected={effectiveActiveTab === 'games'}
            data-active={effectiveActiveTab === 'games' ? 'true' : 'false'}
            onClick={() => handleTabChange('games')}
            className={`flex-1 min-w-[96px] flex items-center justify-center gap-1.5 py-2.5 sm:py-3 rounded-xl font-bold transition-colors duration-150 text-xs sm:text-base ${effectiveActiveTab === 'games' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
          >
            <Swords size={17} /> Matches
          </button>
          
          <button 
            role="tab"
            aria-selected={effectiveActiveTab === 'leaderboards'}
            data-active={effectiveActiveTab === 'leaderboards' ? 'true' : 'false'}
            onClick={() => handleTabChange('leaderboards')}
            className={`flex-1 min-w-[104px] flex items-center justify-center gap-1.5 py-2.5 sm:py-3 rounded-xl font-bold transition-colors duration-150 text-xs sm:text-base ${effectiveActiveTab === 'leaderboards' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
          >
            <Trophy size={17} /> Standings
          </button>
        </div>
      </div>

      {effectiveActiveTab === 'queue' && (!session.sessionType || session.sessionType === 'OPEN_PLAY') && (
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
                <div className="bg-emerald-600/20 text-emerald-400 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 border border-emerald-500/20 tabular-nums">
                  <Users size={14} /> {queuedPlayers.length}
                </div>
              </div>
              {selectedPlayerId && (
                <button 
                  onClick={() => setShowIdentifyModal(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 underline"
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
                      <span className="text-xl font-black text-slate-600 w-8 text-right font-mono tabular-nums">
                        {idx + 1}
                      </span>
                      <div className={`flex-1 ${selectedPlayerId === player.id ? 'ring-2 ring-emerald-500 rounded-2xl' : ''}`}>
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
                <span className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center text-amber-400">
                  <Zap size={16} />
                </span>
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
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 tabular-nums">Match {idx + 1}</div>
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        {batch.teamA.map(p => (
                          <div key={p.id} className={`text-sm font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 ${selectedPlayerId === p.id ? 'ring-2 ring-emerald-400' : ''}`}>
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

      {effectiveActiveTab === 'games' && (
        <main className="max-w-7xl mx-auto px-4 space-y-6">
          {isPoolPlayPhase && (
            <div className="bg-emerald-600/15 border border-emerald-500/30 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs sm:text-sm text-emerald-100 font-medium">
                Pool Play is underway — Round {session?.tournamentState?.currentPoolRound ?? 1}. View your scheduled matchups below.
              </p>
              <button
                type="button"
                onClick={() => handleTabChange('leaderboards')}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
              >
                View Pool Standings
              </button>
            </div>
          )}
          <div className="glass-dark rounded-3xl p-6 border border-white/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Swords size={22} />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight">Session Games</h2>
                  <p className="text-xs text-slate-400 tabular-nums">
                    {completedMatches.length} completed {inProgressMatches.length > 0 ? `• ${inProgressMatches.length} live on courts` : ''}
                  </p>
                </div>
              </div>

              {selectedPlayerId && (
                <div className="flex bg-slate-800 p-1 rounded-xl self-start sm:self-auto">
                  <button
                    onClick={() => setGamesFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors duration-150 tabular-nums ${gamesFilter === 'all' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    All Games ({completedMatches.length})
                  </button>
                  <button
                    onClick={() => setGamesFilter('mine')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors duration-150 tabular-nums ${gamesFilter === 'mine' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    My Games ({completedMatches.filter(m => m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId)).length + myInProgressMatches.length})
                  </button>
                </div>
              )}
            </div>

            {/* In-Progress Live Games */}
            {gamesFilter === 'all' && inProgressMatches.length > 0 && (
              <div className="mb-6 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
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
                      <div key={m.id} className={`bg-slate-800/80 rounded-2xl p-4 border ${isMyMatch ? 'border-emerald-500 shadow-md shadow-emerald-500/10' : 'border-slate-700'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
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
                        {renderLiveGamesPills(m)}
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
                      <div key={m.id} className="bg-emerald-950/40 rounded-2xl p-4 border border-emerald-500 shadow-md shadow-emerald-500/10">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
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
                        {renderLiveGamesPills(m)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upcoming / Scheduled Games */}
            {((gamesFilter === 'all' && pendingMatches.length > 0) || (gamesFilter === 'mine' && myPendingMatches.length > 0)) && (
              <div className="mb-6 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                  <Clock size={14} className="text-amber-400" />
                  Upcoming & Scheduled Matches
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(gamesFilter === 'mine' ? myPendingMatches : pendingMatches).map(m => {
                    const court = courts.find(c => c.id === m.courtId);
                    const courtName = m.courtLabel || court?.label || 'Scheduled Court';
                    const teamAPlayers = m.teamA.map(id => players.find(p => p.id === id)).filter(Boolean);
                    const teamBPlayers = m.teamB.map(id => players.find(p => p.id === id)).filter(Boolean);
                    const isMyMatch = selectedPlayerId && (m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId));

                    return (
                      <div key={m.id} className={`bg-slate-800/60 rounded-2xl p-4 border ${isMyMatch ? 'border-amber-500/60 bg-amber-950/20 shadow-md shadow-amber-500/10' : 'border-slate-700/60'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                            {courtName}
                          </span>
                          <span className="text-xs font-semibold text-slate-400">
                            {m.status === 'READY' ? 'Ready to Play' : 'Scheduled'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex-1 font-semibold text-slate-200">
                            {teamAPlayers.length > 0 ? teamAPlayers.map(p => p?.name).join(' & ') : (m.teamAName || 'Team A')}
                          </div>
                          <span className="text-xs font-bold text-slate-500">VS</span>
                          <div className="flex-1 font-semibold text-slate-200 text-right">
                            {teamBPlayers.length > 0 ? teamBPlayers.map(p => p?.name).join(' & ') : (m.teamBName || 'Team B')}
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
            ) : (() => {
              const renderCompletedMatchCard = (match: DisplayMatchItem) => {
                const matchNumber = matchNumberMap.get(match.id) ?? 1;
                const court = courts.find(c => c.id === match.courtId);
                const courtName = match.courtLabel || court?.label || 'Court';
                const teamAPlayers = match.teamA.map((id: string) => players.find(p => p.id === id)).filter((p): p is Player => Boolean(p));
                const teamBPlayers = match.teamB.map((id: string) => players.find(p => p.id === id)).filter((p): p is Player => Boolean(p));
                const isWinnerA = (match.winner as string) === Team.A || (match.winner as string) === 'A';
                const isWinnerB = (match.winner as string) === Team.B || (match.winner as string) === 'B';
                const isMyMatch = selectedPlayerId && (match.teamA.includes(selectedPlayerId) || match.teamB.includes(selectedPlayerId));
                const myTeamWon = selectedPlayerId && ((match.teamA.includes(selectedPlayerId) && isWinnerA) || (match.teamB.includes(selectedPlayerId) && isWinnerB));
                const duration = formatDuration(match.startedAtEpochMs, match.endedAtEpochMs);
                const endTime = match.endedAtEpochMs ? new Date(match.endedAtEpochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                return (
                  <div
                    key={match.id}
                    className={`bg-slate-800/60 rounded-2xl border p-4 transition-colors duration-150 ${
                      isMyMatch ? 'border-emerald-500/60 bg-emerald-950/20 shadow-md shadow-emerald-500/5' : 'border-slate-700/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-white/5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                          Match #{matchNumber}
                        </span>
                        <span className="text-slate-400 font-medium">
                          {courtName}
                        </span>
                        {isMyMatch && (
                          <span className={`px-2 py-0.5 rounded font-bold inline-flex items-center gap-1 ${
                            myTeamWon ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700 text-slate-300'
                          }`}>
                            {myTeamWon ? <><Trophy size={11} /> Victory</> : 'Played'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-slate-400 tabular-nums">
                        {match.games && match.games.length > 0 && (
                          <div className="flex items-center gap-1.5 mr-2 font-mono">
                            {match.games.map((g, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-slate-900/50 rounded border border-slate-700">
                                {g.scoreA}-{g.scoreB}
                              </span>
                            ))}
                          </div>
                        )}
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
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {match.teamAName || 'Team 1'}
                          </span>
                          <div className="flex items-center gap-2">
                            {match.scoreA != null && (
                              <span className="font-mono tabular-nums text-lg font-black text-slate-200">{match.scoreA}</span>
                            )}
                            {isWinnerA && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white flex items-center gap-1">
                                <Trophy size={10} /> Winner
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {teamAPlayers.map((p, idx) => (
                            <div key={p.id || idx} className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 ring-1 ring-white/10">
                                {p.photoUrl ? (
                                  <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover rounded-full" />
                                ) : (
                                  getInitials(p.name || '??')
                                )}
                              </div>
                              <span className={`text-sm font-semibold truncate ${
                                selectedPlayerId === p.id ? 'text-emerald-300 font-bold underline' : 'text-slate-200'
                              }`}>
                                {p.name || 'Player'}
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
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {match.teamBName || 'Team 2'}
                          </span>
                          <div className="flex items-center gap-2">
                            {match.scoreB != null && (
                              <span className="font-mono tabular-nums text-lg font-black text-slate-200">{match.scoreB}</span>
                            )}
                            {isWinnerB && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white flex items-center gap-1">
                                <Trophy size={10} /> Winner
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {teamBPlayers.map((p, idx) => (
                            <div key={p.id || idx} className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-r from-rose-500 to-orange-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 ring-1 ring-white/10">
                                {p.photoUrl ? (
                                  <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover rounded-full" />
                                ) : (
                                  getInitials(p.name || '??')
                                )}
                              </div>
                              <span className={`text-sm font-semibold truncate ${
                                selectedPlayerId === p.id ? 'text-emerald-300 font-bold underline' : 'text-slate-200'
                              }`}>
                                {p.name || 'Player'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              };

              if (!isTournament) {
                return (
                  <div className="space-y-4">
                    {filteredCompletedMatches.map(m => renderCompletedMatchCard(m))}
                  </div>
                );
              }

              // Group completed tournament matches by round; auto-collapse completed earlier rounds
              const groupMap = new Map<string, { key: string; label: string; sort: number; items: DisplayMatchItem[] }>();
              filteredCompletedMatches.forEach((m) => {
                const key = m.roundGroupKey || 'other';
                if (!groupMap.has(key)) {
                  groupMap.set(key, {
                    key,
                    label: m.roundGroupLabel || 'Completed Matches',
                    sort: m.roundGroupSort ?? 0,
                    items: [],
                  });
                }
                groupMap.get(key)!.items.push(m);
              });
              const groups = Array.from(groupMap.values()).sort((a, b) => b.sort - a.sort);
              const hasActiveOrUpcoming = inProgressMatches.length > 0 || pendingMatches.length > 0;

              return (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Completed Rounds ({filteredCompletedMatches.length} matches)
                  </h3>
                  {groups.map((grp, idx) => {
                    // Auto-collapse completed earlier rounds while active/upcoming games exist,
                    // or keep only the latest finished round expanded once the tournament ends.
                    const defaultOpen = !hasActiveOrUpcoming && idx === 0;
                    const isOpen = expandedRoundGroups[grp.key] ?? defaultOpen;
                    const hasMyMatch = !!selectedPlayerId && grp.items.some(
                      m => m.teamA.includes(selectedPlayerId) || m.teamB.includes(selectedPlayerId)
                    );

                    return (
                      <div key={grp.key} className="rounded-2xl border border-slate-700/80 bg-slate-900/50 overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRoundGroups(prev => ({
                              ...prev,
                              [grp.key]: !isOpen,
                            }))
                          }
                          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-800/60 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-bold text-sm text-slate-100">{grp.label}</span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              ✓ {grp.items.length} completed
                            </span>
                            {hasMyMatch && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                You Played
                              </span>
                            )}
                          </div>
                          <span className="text-slate-400 flex items-center gap-1 text-xs font-semibold shrink-0">
                            {isOpen ? 'Hide' : 'Show'}
                            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="p-4 pt-2 space-y-3 border-t border-white/5">
                            {grp.items.map(m => renderCompletedMatchCard(m))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </main>
      )}

      {effectiveActiveTab === 'leaderboards' && (
        <main className="max-w-7xl mx-auto px-4">
          <div className="glass-dark rounded-3xl p-6 border border-white/5">
            <h2 className="text-2xl font-black tracking-tight mb-6 flex items-center gap-3">
              <Trophy className="text-amber-400" />
              Session Leaderboard
            </h2>
            
            {session?.sessionType && session.sessionType !== 'OPEN_PLAY' && session.tournamentState ? (
              <TournamentLeaderboard tournamentState={session.tournamentState} players={players} sessionType={session.sessionType} />
            ) : (() => {
              const isChaos = session?.sessionType === 'TOURNAMENT_CHAOS';
              const rankedPlayers = isChaos
                ? players
                    .map(p => {
                      let wins = 0;
                      let losses = 0;
                      if (session?.tournamentState?.matches) {
                        session.tournamentState.matches.forEach(m => {
                          if (m.status === 'COMPLETED' || m.winnerTeamId) {
                            const pairA = session.tournamentState!.pairs.find(pair => pair.id === m.teamAId);
                            const pairB = session.tournamentState!.pairs.find(pair => pair.id === m.teamBId);
                            const inA = pairA ? (pairA.player1Id === p.id || pairA.player2Id === p.id) : false;
                            const inB = pairB ? (pairB.player1Id === p.id || pairB.player2Id === p.id) : false;
                            if (inA) {
                              if (m.winnerTeamId === m.teamAId) wins++; else losses++;
                            } else if (inB) {
                              if (m.winnerTeamId === m.teamBId) wins++; else losses++;
                            }
                          }
                        });
                      }
                      const gamesPlayed = wins + losses;
                      return { ...p, wins, losses, gamesPlayed };
                    })
                    .filter(p => p.gamesPlayed > 0)
                    .sort((a, b) => {
                      if (b.wins !== a.wins) return b.wins - a.wins;
                      const winPctA = a.wins / a.gamesPlayed;
                      const winPctB = b.wins / b.gamesPlayed;
                      if (winPctB !== winPctA) return winPctB - winPctA;
                      if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
                      return a.name.localeCompare(b.name);
                    })
                : getSortedPlayers(players, matches)
                    .filter(p => p.sessionGamesPlayed > 0)
                    .map(p => ({
                      ...p,
                      wins: p.sessionWins,
                      losses: p.sessionLosses,
                      gamesPlayed: p.sessionGamesPlayed,
                    }));

              if (rankedPlayers.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <Trophy size={48} className="mb-4 opacity-20" />
                    <p className="font-medium">No matches completed yet</p>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {rankedPlayers.map((player, idx) => {
                      const winPct = ((player.wins / player.gamesPlayed) * 100).toFixed(0);
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
                              {player.wins}W - {player.losses}L
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })()}
          </div>
        </main>
      )}

      {/* Identity Selection Modal */}
      {showIdentifyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full max-h-[85vh] flex flex-col animate-slide-up shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-2 shrink-0">Who are you?</h3>
            <p className="text-slate-400 text-sm mb-4 shrink-0">Select your name to receive live match notifications.</p>

            {/* Sticky instant-filter search input for 32–64+ player sessions */}
            <div className="sticky top-0 z-10 bg-slate-900 pb-3 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={identitySearch}
                  onChange={e => setIdentitySearch(e.target.value)}
                  placeholder="Search your name..."
                  autoFocus
                  aria-label="Search player name"
                  className="w-full px-4 py-3 pr-10 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {identitySearch && (
                  <button
                    type="button"
                    onClick={() => setIdentitySearch('')}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-lg font-bold px-1"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex-1 min-h-0 max-h-80 overflow-y-auto space-y-2 mb-6 pr-2">
              {(() => {
                const q = identitySearch.trim().toLowerCase();
                const filtered = q ? players.filter(p => p.name.toLowerCase().includes(q)) : players;
                if (filtered.length === 0) {
                  return <p className="text-center text-sm text-slate-500 py-6">No players match &quot;{identitySearch}&quot;</p>;
                }
                return filtered.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectIdentity(p.id)}
                    className="w-full text-left p-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700 hover:border-slate-500"
                  >
                    <div className="font-bold text-lg">{p.name}</div>
                    <div className="text-xs text-slate-400 uppercase tracking-widest mt-1">Level {p.skillLevel}</div>
                  </button>
                ));
              })()}
            </div>
            
            <button 
              onClick={() => handleSelectIdentity('spectator')}
              className="w-full py-3 text-slate-400 font-medium hover:text-white hover:bg-slate-800 rounded-xl transition-colors shrink-0"
            >
              Continue as Spectator
            </button>
          </div>
        </div>
      )}

      {/* TOURNAMENT TAB */}
      {(effectiveActiveTab === 'tournament' || (effectiveActiveTab === 'queue' && session.sessionType && session.sessionType !== 'OPEN_PLAY')) && (
        <main className="max-w-7xl mx-auto px-4">
          {!session.tournamentState ? (
            <div className="glass-dark p-12 rounded-3xl text-center border border-white/5 space-y-4 my-8">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <Trophy size={32} />
              </div>
              <h2 className="text-2xl font-black text-white">Waiting for Tournament to Start</h2>
              <p className="text-slate-400 max-w-md mx-auto">
                The organizer is setting up teams and brackets. Tournament matches will appear here once play begins!
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-3xl font-black tracking-tight mb-2">Tournament Bracket</h2>
              
              {session.tournamentState.phase === 'REGISTRATION' && (
                <div className="glass-dark p-8 rounded-3xl text-center border border-white/5">
                  <p className="text-slate-400">Tournament has not started yet. Stay tuned!</p>
                </div>
              )}
              
              {session.tournamentState.phase === 'POOL_PLAY' && (
                <div className="space-y-6">
                  <div className="glass-dark p-6 rounded-3xl text-center border border-white/5 space-y-4">
                    <p className="text-slate-300 text-sm">Pool Play is underway. View your scheduled matchups or live group standings below.</p>
                    <div className="flex flex-wrap justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleTabChange('games')}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
                      >
                        View Pool Matches
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTabChange('leaderboards')}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition-colors border border-slate-700"
                      >
                        View Pool Standings
                      </button>
                    </div>
                  </div>
                  <div className="glass-dark rounded-3xl p-4 sm:p-6 border border-white/5">
                    <TournamentLeaderboard tournamentState={session.tournamentState} players={players} sessionType={session.sessionType} />
                  </div>
                </div>
              )}

              {(session.tournamentState.phase === 'BRACKET' || session.tournamentState.phase === 'COMPLETED') && (() => {
                const isChaosSession = session.sessionType === 'TOURNAMENT_CHAOS';
                const isChaosCompleted = isChaosSession && session.tournamentState!.phase === 'COMPLETED';
                let chaosChampionName = 'Tournament Winner';
                const chaosMaxRound = Math.max(1, ...session.tournamentState!.matches.map(m => m.round));

                if (isChaosCompleted) {
                  const latestChaosMatch = [...session.tournamentState!.matches]
                    .filter(m => m.id.startsWith('chaos_') && (m.status === 'COMPLETED' || m.winnerTeamId))
                    .sort((a, b) => (b.round - a.round) || (b.matchNumber - a.matchNumber))[0];
                  const winPair = latestChaosMatch?.winnerTeamId
                    ? session.tournamentState!.pairs.find(p => p.id === latestChaosMatch.winnerTeamId)
                    : undefined;
                  if (winPair) {
                    chaosChampionName = winPair.name || [
                      players.find(p => p.id === winPair.player1Id)?.name,
                      players.find(p => p.id === winPair.player2Id)?.name,
                    ].filter(Boolean).join(' & ') || 'Tournament Winner';
                  }
                }

                return (
                <div className="pb-4 space-y-6">
                  {isChaosCompleted && (
                    <div className="glass-dark bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border-2 border-amber-500/40 rounded-3xl p-6 text-center shadow-xl space-y-3 animate-slide-up">
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-inner">
                        <Trophy size={30} />
                      </div>
                      <div>
                        <span className="text-xs font-black uppercase tracking-widest text-amber-400 inline-flex items-center gap-1.5">
                          <Trophy size={13} /> Chaos Roulette Champion
                        </span>
                        <h3 className="text-2xl sm:text-3xl font-black text-white mt-1">
                          {chaosChampionName}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-300 font-medium mt-1">
                          Survived all {chaosMaxRound} rounds and conquered the roulette wheel!
                        </p>
                      </div>
                    </div>
                  )}

                  <BracketTree
                    hidePodium={isChaosCompleted}
                    isChaosMode={isChaosSession}
                    matches={session.tournamentState!.matches.filter(m => !m.id.startsWith('pool_match_')).map(m => {
                      const getTeamName = (teamId: string | null) => {
                        if (!teamId) return null;
                        const pair = session.tournamentState!.pairs.find(p => p.id === teamId);
                        if (pair?.name) return pair.name;
                        const p1 = players.find(p => p.id === pair?.player1Id);
                        const p2 = players.find(p => p.id === pair?.player2Id);
                        if (p1 && p2) return `${p1.name} & ${p2.name}`;
                        return 'Unknown Team';
                      };
                      const p1Name = getTeamName(m.teamAId);
                      const p2Name = getTeamName(m.teamBId);
                      return {
                        id: m.id,
                        round: m.round,
                        position: m.matchNumber,
                        player1: p1Name,
                        player2: p2Name,
                        player1Id: m.teamAId,
                        player2Id: m.teamBId,
                        score1: m.scoreA,
                        score2: m.scoreB,
                        winner: m.winnerTeamId === m.teamAId ? p1Name : (m.winnerTeamId === m.teamBId ? p2Name : null),
                        isLosersBracket: m.isLosersBracket,
                        isGrandFinals: m.id.startsWith('gf_'),
                        isBestOf3: m.isBestOf3,
                        games: m.games,
                        is3rdPlaceMatch: m.is3rdPlaceMatch ?? m.id.startsWith('3rd_place_'),
                      };
                    })}
                  />
                </div>
                );
              })()}
            </div>
          )}
        </main>
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
        <div
          role="status"
          aria-live="polite"
          className={`fixed ${activeNotification ? 'top-24' : 'bottom-5'} left-1/2 -translate-x-1/2 z-50 animate-slide-up w-[92%] max-w-md`}
        >
          <div className="bg-indigo-600/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl flex items-start gap-3 border border-indigo-400/50 relative">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <Megaphone size={20} className="animate-pulse" />
            </div>
            <div className="flex-1 min-w-0 pr-6">
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-100 mb-0.5">Announcement</h3>
              <p className="font-semibold text-sm sm:text-base leading-snug break-words">{activeAnnouncement.text}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveAnnouncement(null)}
              aria-label="Dismiss announcement"
              className="p-1 rounded-lg text-indigo-200 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
