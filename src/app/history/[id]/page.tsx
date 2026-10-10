'use client';

import { useStore } from '@/lib/store';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Trophy, ArrowLeft, Clock, Users, Hash, Medal, Award, CheckCircle, Swords, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { Player, Session, Court, Match, Team } from '@/types/models';
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
  const [gamesFilter, setGamesFilter] = useState<'all' | 'mine'>('all');
  const [showGamesBreakdown, setShowGamesBreakdown] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const item = sessionHistory.find(h => h.session.id === id || h.session.joinCode?.toUpperCase() === id?.toUpperCase());
      if (item) {
        setHistoryItem(item);
        setIsLoading(false);
        return;
      }
      
      // Fallback: Fetch from cloud if not in local history
      try {
        const { createClient } = await import('@/lib/supabase');
        const supabase = createClient();
        if (supabase) {
          let data: any = null;
          // Check by session ID first, or by join_code
          const { data: byId } = await supabase.from('sessions').select('*').eq('id', id).maybeSingle();
          if (byId) {
            data = byId;
          } else {
            const { data: byCode } = await supabase.from('sessions').select('*').ilike('join_code', id).maybeSingle();
            if (byCode) data = byCode;
          }

          if (data && data.state_json) {
            const sessionObj = data.state_json.session || {
              id: data.id,
              name: 'Pickleball Session',
              joinCode: data.join_code,
              ownerUid: data.owner_uid,
              createdAtEpochMs: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
              isActive: false,
              courtsPerBatch: (data.state_json.courts || []).length || 4,
              queueBatchesShown: 2,
              showNextUpToPlayers: true
            };
            setHistoryItem({
              session: sessionObj,
              players: data.state_json.players || [],
              courts: data.state_json.courts || [],
              matches: data.state_json.matches || [],
              endedAtEpochMs: data.state_json.endedAtEpochMs || (data.updated_at ? new Date(data.updated_at).getTime() : Date.now())
            });
          }
        }
      } catch(e) {
        console.error("Error fetching history from cloud", e);
      }
      setIsLoading(false);
    };
    
    fetchHistory();
  }, [id, sessionHistory]);

  useEffect(() => {
    if (historyItem) {
      const myId = localStorage.getItem(`qqqqqq_identity_${historyItem.session.id}`) ||
                   localStorage.getItem(`qqqqqq_identity_${historyItem.session.joinCode}`) ||
                   localStorage.getItem(`qqqqqq_identity_${id}`);
      if (myId && myId !== 'spectator') {
        setMyPlayerId(myId);
      }

      if (isPlayerView && myId) {
        let myRankIndex = -1;
        const isTournament = historyItem.session.sessionType && historyItem.session.sessionType.startsWith('TOURNAMENT_');
        
        if (isTournament && historyItem.session.tournamentState) {
          const tState = historyItem.session.tournamentState;
          const rankedPairs = [...tState.pairs].sort((a, b) => {
            const aBracketMatches = tState.matches.filter(m => !m.id.startsWith('pool') && (m.teamAId === a.id || m.teamBId === a.id));
            const bBracketMatches = tState.matches.filter(m => !m.id.startsWith('pool') && (m.teamAId === b.id || m.teamBId === b.id));
            
            const aMaxRound = Math.max(...aBracketMatches.map(m => m.round), 0);
            const bMaxRound = Math.max(...bBracketMatches.map(m => m.round), 0);
            
            const aWonMax = aBracketMatches.some(m => m.round === aMaxRound && m.winnerTeamId === a.id);
            const bWonMax = bBracketMatches.some(m => m.round === bMaxRound && m.winnerTeamId === b.id);
            
            const aBracketScore = aMaxRound * 10 + (aWonMax ? 5 : 0);
            const bBracketScore = bMaxRound * 10 + (bWonMax ? 5 : 0);
            
            if (aBracketScore !== bBracketScore) return bBracketScore - aBracketScore;
            if (b.poolPlayWins !== a.poolPlayWins) return b.poolPlayWins - a.poolPlayWins;
            return b.poolPlayPointDiff - a.poolPlayPointDiff;
          });
          
          const top3Pairs = rankedPairs.slice(0, 3);
          myRankIndex = top3Pairs.findIndex(pair => pair.player1Id === myId || pair.player2Id === myId);
        } else {
          const sortedPlayers = getSortedPlayers(historyItem.players, historyItem.matches);
          const top3 = sortedPlayers.slice(0, 3);
          myRankIndex = top3.findIndex(p => p.id === myId);
        }

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

  const isTournament = historyItem.session.sessionType && historyItem.session.sessionType.startsWith('TOURNAMENT_');
  
  let displayMatches = historyItem.matches;
  let top3: { id: string, name: string, photoUrl?: string, isTeam?: boolean }[] = [];
  let finalRankings: { id: string, name: string, wins: number, losses: number, winPct: number }[] = [];

  if (isTournament && historyItem.session.tournamentState) {
    const tState = historyItem.session.tournamentState;
    
    // 1. Map Tournament Matches
    displayMatches = tState.matches.filter(tm => (tm.status === 'COMPLETED' || (tm.status as any) == null) && tm.teamAId && tm.teamBId).map(tm => {
      const pairA = tState.pairs.find(p => p.id === tm.teamAId);
      const pairB = tState.pairs.find(p => p.id === tm.teamBId);
      
      let courtLabel = '';
      if (tm.id.startsWith('pool_match_')) courtLabel = 'Pool Play';
      else {
        const matchesInThisRound = tState.matches.filter(m => m.round === tm.round && m.isLosersBracket === tm.isLosersBracket && !m.id.startsWith('pool_match_'));
        const matchCount = matchesInThisRound.length;
        if (matchCount === 1) courtLabel = tm.isLosersBracket ? 'Losers Finals' : 'Championship';
        else if (matchCount === 2) courtLabel = tm.isLosersBracket ? 'Losers Semifinals' : 'Semifinals';
        else if (matchCount >= 3 && matchCount <= 4) courtLabel = tm.isLosersBracket ? 'Losers Quarterfinals' : 'Quarterfinals';
        else courtLabel = tm.isLosersBracket ? `Losers R${tm.round}` : `Bracket R${tm.round}`;
      }
      if (tm.isBestOf3) courtLabel += ' (BO3)';
        
      let winner = null;
      if (tm.winnerTeamId === tm.teamAId) winner = 'A';
      else if (tm.winnerTeamId === tm.teamBId) winner = 'B';

      return {
        id: tm.id,
        courtId: tm.courtId || '',
        courtLabel,
        teamA: pairA ? [pairA.player1Id, pairA.player2Id] : [],
        teamB: pairB ? [pairB.player1Id, pairB.player2Id] : [],
        startedAtEpochMs: tm.startedAtEpochMs || 0,
        endedAtEpochMs: tm.endedAtEpochMs || 0,
        winner,
        status: tm.status,
        scoreA: tm.scoreA,
        scoreB: tm.scoreB,
        isBestOf3: tm.isBestOf3,
        games: tm.games,
        teamAName: pairA?.name || null,
        teamBName: pairB?.name || null,
      } as any;
    });

    // 2. Rank pairs (Deduplicate for Chaos Roulette)
    const pairScores = tState.pairs.map(pair => {
      const pairBracketMatches = tState.matches.filter(m => !m.id.startsWith('pool') && (m.teamAId === pair.id || m.teamBId === pair.id));
      const maxRound = Math.max(...pairBracketMatches.map(m => m.round), 0);
      const wonMax = pairBracketMatches.some(m => m.round === maxRound && m.winnerTeamId === pair.id);
      const bracketScore = maxRound * 10 + (wonMax ? 5 : 0);
      const playerIds = [pair.player1Id, pair.player2Id].sort().join('_');
      return { pair, playerIds, bracketScore, poolPlayWins: pair.poolPlayWins || 0, poolPlayPointDiff: pair.poolPlayPointDiff || 0 };
    });

    const dedupedScoresMap = new Map<string, typeof pairScores[0]>();
    for (const item of pairScores) {
      const existing = dedupedScoresMap.get(item.playerIds);
      if (!existing) {
        dedupedScoresMap.set(item.playerIds, item);
      } else {
        if (item.bracketScore > existing.bracketScore) {
           dedupedScoresMap.set(item.playerIds, { ...item, poolPlayWins: existing.poolPlayWins + item.poolPlayWins, poolPlayPointDiff: existing.poolPlayPointDiff + item.poolPlayPointDiff });
        } else {
           existing.poolPlayWins += item.poolPlayWins;
           existing.poolPlayPointDiff += item.poolPlayPointDiff;
        }
      }
    }

    const dedupedScores = Array.from(dedupedScoresMap.values());
    dedupedScores.sort((a, b) => {
      if (a.bracketScore !== b.bracketScore) return b.bracketScore - a.bracketScore;
      if (a.poolPlayWins !== b.poolPlayWins) return b.poolPlayWins - a.poolPlayWins;
      return b.poolPlayPointDiff - a.poolPlayPointDiff;
    });

    const rankedPairs = dedupedScores.map(d => d.pair);

    finalRankings = rankedPairs.map(pair => {
      let name = pair.name;
      if (!name || name.includes('Unknown')) {
        const p1 = historyItem.players.find(p => p.id === pair.player1Id);
        const p2 = historyItem.players.find(p => p.id === pair.player2Id);
        if (p1 && p2) name = `${p1.name} & ${p2.name}`;
        else if (p1) name = p1.name;
        else if (p2) name = p2.name;
        else name = 'Team';
      }
      
      // Calculate overall tournament wins/losses using player IDs to catch all their chaos rounds
      let wins = 0;
      let losses = 0;
      const targetIds = [pair.player1Id, pair.player2Id].sort().join('_');
      
      tState.matches.forEach(m => {
        if (m.winnerTeamId) {
          const tA = tState.pairs.find(p => p.id === m.teamAId);
          const tB = tState.pairs.find(p => p.id === m.teamBId);
          const tAIds = tA ? [tA.player1Id, tA.player2Id].sort().join('_') : '';
          const tBIds = tB ? [tB.player1Id, tB.player2Id].sort().join('_') : '';
          
          if (tAIds === targetIds) {
            if (m.winnerTeamId === m.teamAId) wins++; else losses++;
          }
          if (tBIds === targetIds) {
            if (m.winnerTeamId === m.teamBId) wins++; else losses++;
          }
        }
      });
      const totalGames = wins + losses;
      const winPct = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
      
      return { id: pair.id, name, wins, losses, winPct };
    });

    top3 = finalRankings.slice(0, 3).map(r => ({ ...r, isTeam: true }));
  } else {
    const sortedPlayers = getSortedPlayers(historyItem.players, historyItem.matches);
    finalRankings = sortedPlayers.map(p => {
      const wins = p.sessionWins;
      const losses = p.sessionLosses;
      const totalGames = p.sessionGamesPlayed;
      const winPct = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
      return { id: p.id, name: p.name, wins, losses, winPct, photoUrl: p.photoUrl };
    });
    
    top3 = finalRankings.slice(0, 3).map(r => ({ ...r, isTeam: false }));
  }

  const totalMatches = displayMatches.length;
  
  // Calculate chronological match numbers
  const matchNumberMap = new Map<string, number>();
  [...displayMatches]
    .sort((a, b) => a.startedAtEpochMs - b.startedAtEpochMs)
    .forEach((m, idx) => matchNumberMap.set(m.id, idx + 1));

  // Sort matches from newest to oldest
  const sortedMatches = [...displayMatches].sort(
    (a, b) => (b.endedAtEpochMs ?? b.startedAtEpochMs) - (a.endedAtEpochMs ?? a.startedAtEpochMs)
  );

  const filteredMatches = gamesFilter === 'mine' && myPlayerId
    ? sortedMatches.filter(m => m.teamA.includes(myPlayerId) || m.teamB.includes(myPlayerId))
    : sortedMatches;
  
  // Calculate some fun stats
  let totalGamesPlayed = 0;
  let averageGamesPerPlayer = '0';
  let mostActivePlayer: Player | undefined;
  let mostActiveGames = 0;

  if (isTournament) {
    const playerGameCounts = new Map<string, number>();
    displayMatches.forEach(m => {
      [...m.teamA, ...m.teamB].forEach(pId => {
        playerGameCounts.set(pId, (playerGameCounts.get(pId) || 0) + 1);
      });
    });
    totalGamesPlayed = Array.from(playerGameCounts.values()).reduce((sum, count) => sum + count, 0);
    averageGamesPerPlayer = historyItem.players.length > 0 ? (totalGamesPlayed / historyItem.players.length).toFixed(1) : '0';
    
    let maxGames = -1;
    let maxPlayerId = '';
    playerGameCounts.forEach((count, pId) => {
      if (count > maxGames) { maxGames = count; maxPlayerId = pId; }
    });
    mostActivePlayer = historyItem.players.find(p => p.id === maxPlayerId);
    mostActiveGames = maxGames > 0 ? maxGames : 0;
  } else {
    totalGamesPlayed = historyItem.players.reduce((sum: number, p: Player) => sum + p.sessionGamesPlayed, 0);
    averageGamesPerPlayer = historyItem.players.length > 0 ? (totalGamesPlayed / historyItem.players.length).toFixed(1) : '0';
    mostActivePlayer = [...historyItem.players].sort((a, b) => b.sessionGamesPlayed - a.sessionGamesPlayed)[0];
    mostActiveGames = mostActivePlayer?.sessionGamesPlayed || 0;
  }

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
          <h1 className="text-3xl font-bold tracking-tight">{historyItem.session.name || 'Pickleball Session'} - Analysis</h1>
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
            <div className="text-base font-bold text-gray-900 dark:text-gray-100">
              {new Date(historyItem.endedAtEpochMs).toLocaleDateString()} {new Date(historyItem.endedAtEpochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
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

        {/* Match Breakdown / All Games Section */}
        <div className="bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
          <div 
            className={`p-6 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${!showGamesBreakdown ? 'border-b-0' : ''}`}
            onClick={() => setShowGamesBreakdown(!showGamesBreakdown)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-sm">
                <Swords size={22} />
              </div>
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  Games Breakdown
                  {showGamesBreakdown ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {totalMatches} matches recorded across {historyItem.courts.length} courts
                </p>
              </div>
            </div>

            {myPlayerId && showGamesBreakdown && (
              <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl self-start sm:self-auto" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setGamesFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    gamesFilter === 'all'
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  All Games ({totalMatches})
                </button>
                <button
                  onClick={() => setGamesFilter('mine')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    gamesFilter === 'mine'
                      ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  My Games ({displayMatches.filter(m => m.teamA.includes(myPlayerId) || m.teamB.includes(myPlayerId)).length})
                </button>
              </div>
            )}
          </div>

          {showGamesBreakdown && (
            <div className="p-6">
              {filteredMatches.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Swords size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="font-semibold text-base">No matches found</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {gamesFilter === 'mine' ? "You did not play in any recorded matches." : "No matches were recorded for this session."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredMatches.map((match, idx) => {
                    const matchNumber = matchNumberMap.get(match.id) ?? (idx + 1);
                    const court = historyItem.courts.find(c => c.id === match.courtId);
                    const courtName = match.courtLabel || court?.label || 'Court';
                    const teamAPlayers = match.teamA.map(pId => historyItem.players.find(p => p.id === pId)).filter(Boolean);
                    const teamBPlayers = match.teamB.map(pId => historyItem.players.find(p => p.id === pId)).filter(Boolean);
                    const isWinnerA = (match.winner as string) === Team.A || (match.winner as string) === 'A';
                    const isWinnerB = (match.winner as string) === Team.B || (match.winner as string) === 'B';
                    const isMyMatch = myPlayerId && (match.teamA.includes(myPlayerId) || match.teamB.includes(myPlayerId));
                    const myTeamWon = myPlayerId && ((match.teamA.includes(myPlayerId) && isWinnerA) || (match.teamB.includes(myPlayerId) && isWinnerB));
                    
                    const formatDuration = (start: number, end: number | null): string => {
                      if (!end || end < start) return '< 1 min';
                      const totalSec = Math.floor((end - start) / 1000);
                      const m = Math.floor(totalSec / 60);
                      const s = totalSec % 60;
                      return m === 0 ? `${s}s` : `${m}m ${s}s`;
                    };
                    const duration = formatDuration(match.startedAtEpochMs, match.endedAtEpochMs);
                    const endTime = match.endedAtEpochMs 
                      ? new Date(match.endedAtEpochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'In progress';

                    return (
                      <div
                        key={match.id}
                        className={`rounded-2xl border transition-all overflow-hidden ${
                          isMyMatch
                            ? 'border-blue-400/80 bg-blue-50/20 dark:bg-blue-950/20 shadow-sm'
                            : 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30'
                        }`}
                      >
                        <div className="px-5 py-3 bg-gray-100/60 dark:bg-gray-800/60 border-b border-gray-200/60 dark:border-gray-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold px-2 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                              Match #{matchNumber}
                            </span>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">
                              {courtName}
                            </span>
                            {isMyMatch && (
                              <span className={`px-2 py-0.5 rounded-md font-bold ${
                                myTeamWon ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                              }`}>
                                {myTeamWon ? '🏆 Victory' : 'Played'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400 font-medium">
                            <span className="flex items-center gap-1">
                              <Clock size={12} /> {duration}
                            </span>
                            {match.endedAtEpochMs && <span>{endTime}</span>}
                          </div>
                        </div>

                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Team A */}
                          <div className={`p-3 rounded-xl border ${
                            isWinnerA 
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60' 
                              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Team 1</span>
                              {isWinnerA && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white flex items-center gap-1 shadow-xs">
                                  <Trophy size={10} /> Winner
                                </span>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              {teamAPlayers.map((p, pIdx) => (
                                <div key={p?.id || pIdx} className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                    {p?.photoUrl ? (
                                      <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover rounded-full" />
                                    ) : (
                                      (p?.name || '??').substring(0, 2).toUpperCase()
                                    )}
                                  </div>
                                  <span className={`text-sm font-semibold truncate ${
                                    myPlayerId === p?.id ? 'text-blue-600 dark:text-blue-400 font-bold underline' : 'text-gray-800 dark:text-gray-200'
                                  }`}>
                                    {p?.name || 'Player'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Team B */}
                          <div className={`p-3 rounded-xl border ${
                            isWinnerB 
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60' 
                              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Team 2</span>
                              {isWinnerB && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white flex items-center gap-1 shadow-xs">
                                  <Trophy size={10} /> Winner
                                </span>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              {teamBPlayers.map((p, pIdx) => (
                                <div key={p?.id || pIdx} className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-r from-rose-500 to-orange-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                    {p?.photoUrl ? (
                                      <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover rounded-full" />
                                    ) : (
                                      (p?.name || '??').substring(0, 2).toUpperCase()
                                    )}
                                  </div>
                                  <span className={`text-sm font-semibold truncate ${
                                    myPlayerId === p?.id ? 'text-blue-600 dark:text-blue-400 font-bold underline' : 'text-gray-800 dark:text-gray-200'
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
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden p-6">
          <h2 className="text-xl font-bold mb-4">In-Depth Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Average Games Per Player</div>
              <div className="text-2xl font-bold">{averageGamesPerPlayer}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Most Active Player</div>
              <div className="text-xl font-bold">{mostActivePlayer?.name || 'N/A'} <span className="text-sm font-normal text-gray-500">({mostActiveGames} games)</span></div>
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
                {finalRankings.map((rankedItem, idx: number) => {
                  return (
                    <tr key={rankedItem.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-400">#{idx + 1}</td>
                      <td className="px-6 py-4 font-bold">{rankedItem.name}</td>
                      <td className="px-6 py-4 text-center font-medium">
                        <span className="text-emerald-600 dark:text-emerald-400">{rankedItem.wins}</span>
                        <span className="text-gray-400 mx-1">-</span>
                        <span className="text-rose-600 dark:text-rose-400">{rankedItem.losses}</span>
                      </td>
                      <td className="px-6 py-4 text-center font-bold">{rankedItem.winPct}%</td>
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
