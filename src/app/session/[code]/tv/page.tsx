'use client';

import { useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { CourtStatus, PlayerStatus, SessionType, TournamentMatch, Session, Player, Court, Match } from '@/types/models';
import { PlayerCard } from '@/components/ui/PlayerCard';
import { CourtCard } from '@/components/ui/CourtCard';
import QRCodeDisplay from '@/components/ui/QRCodeDisplay';
import { BracketTree, TournamentMatch as BracketMatch } from '@/components/ui/BracketTree';
import { TournamentLeaderboard } from '@/components/ui/TournamentLeaderboard';
import { Trophy, Clock, Flame, Users, CheckCircle2, PlayCircle, Award, Crown, Shield } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

interface CloudSessionState {
  session: Session | null;
  players: Player[];
  courts: Court[];
  matches: Match[];
}

export default function TVDisplayPage() {
  const params = useParams();
  const rawCode = params?.code;
  const code = (typeof rawCode === 'string' ? rawCode : Array.isArray(rawCode) ? rawCode[0] : '').toUpperCase();
  const { session, courts, players, matches } = useStore();
  const [time, setTime] = useState(new Date());
  const lastCloudTimestamp = useRef<string>('');

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cloud Sync for TV View
  useEffect(() => {
    let channel: { unsubscribe: () => void } | null = null;
    let isMounted = true;
    
    const applyCloudState = (stateJson: Partial<CloudSessionState> | null, updatedAt: string) => {
      if (!isMounted || !stateJson) return;
      if (updatedAt && lastCloudTimestamp.current) {
        const newTime = new Date(updatedAt).getTime();
        const lastTime = new Date(lastCloudTimestamp.current).getTime();
        if (!isNaN(newTime) && !isNaN(lastTime) && newTime <= lastTime) {
          return;
        }
      }
      lastCloudTimestamp.current = updatedAt || new Date().toISOString();
      useStore.setState({
        session: stateJson.session ?? null,
        players: stateJson.players ?? [],
        courts: stateJson.courts ?? [],
        matches: stateJson.matches ?? []
      });
    };

    const initCloud = async () => {
      const { createClient } = await import('@/lib/supabase');
      const supabase = createClient();
      if (!supabase) return;

      const { data } = await supabase
        .from('sessions')
        .select('state_json, is_active, updated_at, join_code')
        .ilike('join_code', code)
        .maybeSingle();

      if (data && isMounted) {
        applyCloudState(data.state_json as Partial<CloudSessionState> | null, data.updated_at);
      }

      const canonicalCode = data?.join_code || code;
      channel = supabase.channel(`tv-view-${canonicalCode}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'sessions',
          filter: `join_code=eq.${canonicalCode}`
        }, (payload: { new?: { state_json?: Partial<CloudSessionState>; updated_at?: string } }) => {
          const newData = payload.new;
          if (newData?.state_json && isMounted) {
            applyCloudState(newData.state_json, newData.updated_at || '');
          }
        })
        .subscribe();

      const pollInterval = setInterval(async () => {
        if (!isMounted) return;
        const { data: pollData } = await supabase
          .from('sessions')
          .select('state_json, updated_at')
          .ilike('join_code', code)
          .maybeSingle();
        if (pollData && isMounted) {
          applyCloudState(pollData.state_json as Partial<CloudSessionState> | null, pollData.updated_at);
        }
      }, 8000);

      return () => clearInterval(pollInterval);
    };

    const cleanup = initCloud();
    return () => {
      isMounted = false;
      if (channel) channel.unsubscribe();
      cleanup?.then(fn => fn?.());
    };
  }, [code]);

  if (!session || session.joinCode?.toUpperCase() !== code) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-6"></div>
        <div className="text-3xl font-black mb-2">Connecting TV Display...</div>
        <div className="text-slate-400 font-mono text-lg">Session Code: {code}</div>
      </div>
    );
  }

  const isTournament = Boolean(session.sessionType && session.sessionType !== SessionType.OPEN_PLAY);
  const tournamentState = session.tournamentState;
  const phase = tournamentState?.phase || 'REGISTRATION';

  // Helper for team names in tournament mode
  const getTeamName = (teamId: string | null): string => {
    if (!teamId) return 'TBD';
    const pair = tournamentState?.pairs.find(p => p.id === teamId);
    if (pair?.name) return pair.name;
    const p1 = players.find(p => p.id === pair?.player1Id);
    const p2 = players.find(p => p.id === pair?.player2Id);
    if (p1 && p2) return `${p1.name} & ${p2.name}`;
    if (p1) return p1.name;
    if (p2) return p2.name;
    return 'Unknown Team';
  };

  const getTeamPlayers = (teamId: string | null): string[] => {
    if (!teamId) return [];
    const pair = tournamentState?.pairs.find(p => p.id === teamId);
    if (!pair) return [];
    const p1 = players.find(p => p.id === pair.player1Id);
    const p2 = players.find(p => p.id === pair.player2Id);
    return [p1?.name, p2?.name].filter((n): n is string => Boolean(n));
  };

  // Bracket matches mapped to BracketTree format
  const mappedBracketMatches: BracketMatch[] = (tournamentState?.matches || [])
    .filter(m => !m.id.startsWith('pool_match_'))
    .map(m => {
      const p1Name = m.teamAId ? getTeamName(m.teamAId) : null;
      const p2Name = m.teamBId ? getTeamName(m.teamBId) : null;
      let winnerName: string | null = null;
      if (m.winnerTeamId) {
        winnerName = m.winnerTeamId === m.teamAId ? p1Name : (m.winnerTeamId === m.teamBId ? p2Name : null);
      }
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
        winner: winnerName,
        isLosersBracket: Boolean(m.isLosersBracket),
        isGrandFinals: m.id.startsWith('gf_')
      };
    });

  // Active tournament matches (IN_PROGRESS or READY)
  const tourneyMatches = tournamentState?.matches || [];
  const activeTourneyMatches = tourneyMatches.filter(m => m.status === 'IN_PROGRESS' || m.status === 'READY');
  const poolMatches = tourneyMatches.filter(m => m.id.startsWith('pool_match_'));
  const recentPoolMatches = poolMatches
    .filter(m => m.status === 'COMPLETED' && m.endedAtEpochMs != null)
    .sort((a, b) => (b.endedAtEpochMs ?? 0) - (a.endedAtEpochMs ?? 0));

  // Pool standings sorted by wins desc, point diff desc, points scored desc
  const poolStandings = [...(tournamentState?.pairs || [])].sort((a, b) => {
    if ((b.poolPlayWins ?? 0) !== (a.poolPlayWins ?? 0)) return (b.poolPlayWins ?? 0) - (a.poolPlayWins ?? 0);
    if ((b.poolPlayPointDiff ?? 0) !== (a.poolPlayPointDiff ?? 0)) return (b.poolPlayPointDiff ?? 0) - (a.poolPlayPointDiff ?? 0);
    return (b.poolPlayPointsScored ?? 0) - (a.poolPlayPointsScored ?? 0);
  });

  const getMatchCourtLabel = (match: TournamentMatch): string => {
    if (match.courtId) {
      const court = courts.find(c => c.id === match.courtId);
      if (court) return court.label;
    }
    const courtWithMatch = courts.find(c => c.currentMatchId === match.id);
    if (courtWithMatch) return courtWithMatch.label;
    return match.status === 'IN_PROGRESS' ? 'Court in Use' : 'Court TBD';
  };

  // Champion detection for COMPLETED phase
  const grandFinalMatch = mappedBracketMatches.find(m => m.isGrandFinals) ||
    mappedBracketMatches.filter(m => !m.isLosersBracket).sort((a, b) => b.round - a.round)[0];
  const championName = grandFinalMatch?.winner || null;
  const championWinnerId = grandFinalMatch ? (
    grandFinalMatch.winner === grandFinalMatch.player1 ? grandFinalMatch.player1Id : grandFinalMatch.player2Id
  ) : null;
  const championPlayers = championWinnerId ? getTeamPlayers(championWinnerId) : [];

  // Tournament mode headers
  const tournamentTypeLabel =
    session.sessionType === SessionType.TOURNAMENT_DOUBLES ? 'The Grand Slam' :
    session.sessionType === SessionType.TOURNAMENT_SINGLE_ELIM ? 'Knockout Sprint' :
    session.sessionType === SessionType.TOURNAMENT_CHAOS ? 'Chaos Roulette' :
    'Tournament';

  const phaseBadgeLabel =
    phase === 'POOL_PLAY' ? 'Pool Play Phase' :
    phase === 'BRACKET' ? 'Bracket Phase' :
    phase === 'COMPLETED' ? 'Tournament Completed' :
    'Registration Phase';

  // Open play queued players
  const openPlayActiveMatches = matches.filter(m => m.endedAtEpochMs == null);
  const openPlayActivePlayerIds = new Set(openPlayActiveMatches.flatMap(m => [...m.teamA, ...m.teamB]));
  const queuedPlayers = players
    .filter(p => (p.status === PlayerStatus.AVAILABLE || p.status === PlayerStatus.QUEUED) && !p.currentCourtId && !openPlayActivePlayerIds.has(p.id))
    .sort((a, b) => a.queuedAtEpochMs - b.queuedAtEpochMs);
  const upNext = queuedPlayers.slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden flex flex-col font-sans select-none">
      {/* ─── TV Header ─── */}
      <header className="bg-slate-900/90 px-6 py-4 flex justify-between items-center border-b border-slate-800 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            {isTournament ? <Trophy size={28} className="text-white" /> : <span className="text-2xl font-black">Q</span>}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">{session.name}</h1>
              {isTournament && (
                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {tournamentTypeLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs md:text-sm font-bold">
              <span className="text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                {isTournament ? phaseBadgeLabel : 'LIVE'}
              </span>
              <span className="text-slate-400">
                {courts.filter(c => c.status === CourtStatus.IN_PROGRESS).length} / {courts.length} Courts Active
              </span>
              {isTournament && tournamentState && (
                <span className="text-slate-400 hidden sm:inline">
                  {tournamentState.pairs.length} Teams • {tournamentState.matches.filter(m => m.status === 'COMPLETED').length} / {tournamentState.matches.length} Matches Done
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Digital Clock */}
        <div className="text-4xl md:text-5xl font-black font-mono tracking-tighter text-slate-200 drop-shadow-md">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      {/* ─── TOURNAMENT TV DISPLAY ─── */}
      {isTournament ? (
        <main className="flex-1 flex p-6 gap-6 overflow-hidden">
          {/* Main Tournament Arena */}
          <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
            
            {/* ─── POOL PLAY PHASE ─── */}
            {phase === 'POOL_PLAY' && (
              <div className="space-y-6">
                {/* Leaderboard Podium & Ranked Cards */}
                {tournamentState && (
                  <div className="bg-slate-900/60 rounded-3xl p-6 border border-slate-800">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                        <Trophy className="text-amber-400" size={24} /> Pool Standings & Leaderboard
                      </h2>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Ranked by Wins & Point Diff
                      </span>
                    </div>
                    <TournamentLeaderboard tournamentState={tournamentState} players={players} />
                  </div>
                )}

                {/* Detailed Standings Table */}
                <div className="bg-slate-900/60 rounded-3xl p-6 border border-slate-800">
                  <h3 className="text-lg font-black tracking-tight text-white mb-4 uppercase tracking-wider text-slate-300">
                    Full Pool Standings Table
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-xs font-black uppercase tracking-wider">
                          <th className="py-3 px-4">Rank</th>
                          <th className="py-3 px-4">Team</th>
                          <th className="py-3 px-4 text-center">Wins</th>
                          <th className="py-3 px-4 text-center">Point Diff</th>
                          <th className="py-3 px-4 text-center">Pts Scored</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-sm">
                        {poolStandings.map((pair, idx) => {
                          const isTop = idx < 4;
                          return (
                            <tr key={pair.id} className={isTop ? 'bg-indigo-500/5' : ''}>
                              <td className="py-3.5 px-4 font-mono font-black text-slate-400">
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${
                                  idx === 0 ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                                  idx === 1 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30' :
                                  idx === 2 ? 'bg-amber-600/20 text-amber-300 border border-amber-600/30' :
                                  'bg-slate-800 text-slate-400'
                                }`}>
                                  {idx + 1}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-extrabold text-white text-base">
                                {pair.name || getTeamName(pair.id)}
                              </td>
                              <td className="py-3.5 px-4 text-center font-black text-emerald-400 text-base">
                                {pair.poolPlayWins}W
                              </td>
                              <td className="py-3.5 px-4 text-center font-mono font-bold text-sm">
                                <span className={pair.poolPlayPointDiff > 0 ? 'text-emerald-400 font-black' : pair.poolPlayPointDiff < 0 ? 'text-rose-400 font-black' : 'text-slate-400'}>
                                  {pair.poolPlayPointDiff > 0 ? '+' : ''}{pair.poolPlayPointDiff}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-center font-mono text-slate-300">
                                {pair.poolPlayPointsScored}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent Completed Pool Matches */}
                {recentPoolMatches.length > 0 && (
                  <div className="bg-slate-900/60 rounded-3xl p-6 border border-slate-800">
                    <h3 className="text-lg font-black tracking-tight text-white mb-4 uppercase tracking-wider text-slate-300">
                      Recent Pool Play Results
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {recentPoolMatches.slice(0, 6).map(m => {
                        const isWinnerA = m.winnerTeamId === m.teamAId;
                        const isWinnerB = m.winnerTeamId === m.teamBId;
                        return (
                          <div key={m.id} className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-2">
                            <div className="flex justify-between items-center text-xs text-slate-400 font-bold">
                              <span>Match #{m.matchNumber} (Round {m.round})</span>
                              <span className="text-emerald-400 font-black">✓ FINAL</span>
                            </div>
                            <div className={`flex justify-between items-center px-3 py-1.5 rounded-lg ${isWinnerA ? 'bg-emerald-950/40 text-emerald-200 font-black' : 'text-slate-300 font-medium'}`}>
                              <span className="truncate mr-2">{getTeamName(m.teamAId)}</span>
                              <span className="font-mono font-black">{m.scoreA ?? '-'}</span>
                            </div>
                            <div className={`flex justify-between items-center px-3 py-1.5 rounded-lg ${isWinnerB ? 'bg-emerald-950/40 text-emerald-200 font-black' : 'text-slate-300 font-medium'}`}>
                              <span className="truncate mr-2">{getTeamName(m.teamBId)}</span>
                              <span className="font-mono font-black">{m.scoreB ?? '-'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── BRACKET PHASE ─── */}
            {phase === 'BRACKET' && (
              <div className="flex-1 flex flex-col gap-4 min-h-[700px]">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                      <Crown className="text-emerald-400" size={28} /> Championship Bracket
                    </h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">
                      Live Tournament Progression
                    </p>
                  </div>
                </div>
                <div className="flex-1 bg-slate-900/60 rounded-3xl border border-slate-800 p-4 overflow-hidden">
                  <BracketTree matches={mappedBracketMatches} />
                </div>
              </div>
            )}

            {/* ─── COMPLETED PHASE ─── */}
            {phase === 'COMPLETED' && (
              <div className="space-y-6 animate-slide-up">
                {/* Champion Trophy Banner */}
                <div className="bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border-2 border-yellow-500/50 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
                  <div className="flex justify-center mb-3">
                    <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-3xl flex items-center justify-center shadow-lg shadow-yellow-500/30 border border-yellow-300">
                      <Trophy size={44} className="text-yellow-100" />
                    </div>
                  </div>
                  <div className="text-xs font-black uppercase tracking-widest text-amber-400 mb-1">
                    Tournament Champions
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-md">
                    {championName || 'Champion'}
                  </h2>
                  {championPlayers.length > 0 && (
                    <p className="text-lg font-bold text-amber-200/90 mt-2">
                      {championPlayers.join(' & ')}
                    </p>
                  )}
                </div>

                {/* Tournament Podium Display */}
                {tournamentState && (
                  <div className="bg-slate-900/60 rounded-3xl p-6 border border-slate-800">
                    <h3 className="text-lg font-black text-slate-300 uppercase tracking-wider mb-2 text-center">
                      Final Podium
                    </h3>
                    <TournamentLeaderboard tournamentState={tournamentState} players={players} />
                  </div>
                )}

                {/* Final Completed Bracket */}
                <div className="bg-slate-900/60 rounded-3xl border border-slate-800 p-4 overflow-hidden min-h-[600px]">
                  <h3 className="text-lg font-black text-slate-300 uppercase tracking-wider mb-4 px-2">
                    Final Tournament Bracket
                  </h3>
                  <BracketTree matches={mappedBracketMatches} />
                </div>
              </div>
            )}

            {/* ─── REGISTRATION PHASE ─── */}
            {phase === 'REGISTRATION' && (
              <div className="bg-slate-900/60 rounded-3xl p-10 border border-slate-800 text-center space-y-6">
                <div className="w-20 h-20 mx-auto bg-indigo-500/20 rounded-3xl flex items-center justify-center border border-indigo-500/30">
                  <Users size={40} className="text-indigo-400" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black text-white">Tournament Registration Open</h2>
                  <p className="text-slate-400 text-base max-w-md mx-auto font-medium">
                    Teams are currently forming. Scan the QR code with your phone to check in and join the lineup!
                  </p>
                </div>
                {tournamentState && tournamentState.pairs.length > 0 && (
                  <div className="pt-4 max-w-2xl mx-auto">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-3">
                      Registered Teams ({tournamentState.pairs.length})
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {tournamentState.pairs.map(p => (
                        <div key={p.id} className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 font-bold text-sm text-slate-200">
                          {p.name || getTeamName(p.id)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ─── Tournament Sidebar: Active Matches & QR ─── */}
          <aside className="w-96 flex flex-col gap-6 shrink-0">
            {/* Active Match Info (IN_PROGRESS & READY) */}
            <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 flex-1 overflow-hidden flex flex-col">
              <h2 className="text-xl font-black mb-4 tracking-tight text-indigo-400 uppercase flex items-center gap-2">
                <PlayCircle size={20} /> Active Matches ({activeTourneyMatches.length})
              </h2>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {activeTourneyMatches.length === 0 ? (
                  <div className="text-slate-600 font-bold text-center mt-12 text-base">
                    No active matches on court
                  </div>
                ) : (
                  activeTourneyMatches.map(m => {
                    const isLive = m.status === 'IN_PROGRESS';
                    const courtLabel = getMatchCourtLabel(m);
                    const tA = getTeamName(m.teamAId);
                    const tB = getTeamName(m.teamBId);

                    return (
                      <div
                        key={m.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          isLive
                            ? 'bg-emerald-950/30 border-emerald-500/40 shadow-md'
                            : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200">
                            {courtLabel}
                          </span>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                            isLive
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}>
                            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                            {isLive ? 'LIVE' : 'READY'}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-sm font-bold">
                            <span className="truncate mr-2 text-slate-100">{tA}</span>
                            <span className="font-mono font-black text-slate-200 text-base">{m.scoreA ?? '-'}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm font-bold">
                            <span className="truncate mr-2 text-slate-100">{tB}</span>
                            <span className="font-mono font-black text-slate-200 text-base">{m.scoreB ?? '-'}</span>
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          <span>Match #{m.matchNumber}</span>
                          <span>Round {m.round}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* QR Code in corner */}
            <div className="bg-slate-900/80 rounded-3xl p-5 border border-slate-800 flex flex-col items-center text-center">
              <QRCodeDisplay joinCode={session.joinCode} size={170} />
              <div className="mt-3">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Join / View On Phone</span>
                <div className="text-xl font-mono font-black tracking-widest text-white mt-0.5">{session.joinCode}</div>
              </div>
            </div>
          </aside>
        </main>
      ) : (
        /* ─── OPEN PLAY DISPLAY (Preserved) ─── */
        <main className="flex-1 flex p-6 gap-6 overflow-hidden">
          <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max overflow-y-auto pr-2 pb-6 custom-scrollbar">
            {courts.map(court => (
              <div key={court.id} className="transform scale-100 origin-top">
                <CourtCard court={court} readOnly={true} />
              </div>
            ))}
          </div>

          <aside className="w-96 flex flex-col gap-6 shrink-0">
            <div className="glass-dark rounded-3xl p-6 border border-slate-800 flex-1 overflow-hidden flex flex-col">
              <h2 className="text-2xl font-black mb-6 tracking-tight text-blue-400 uppercase">Up Next</h2>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {upNext.length === 0 ? (
                  <div className="text-slate-600 font-bold text-center mt-10 text-xl">Queue Empty</div>
                ) : (
                  upNext.map((player, idx) => (
                    <div key={player.id} className="flex items-center gap-4 bg-slate-900/50 p-3 rounded-2xl border border-slate-800">
                      <span className="text-2xl font-black text-slate-700 w-8 text-right font-mono">{idx + 1}</span>
                      <div className="flex-1">
                        <PlayerCard player={player} compact />
                      </div>
                    </div>
                  ))
                )}
              </div>
              {queuedPlayers.length > 8 && (
                <div className="pt-4 mt-2 border-t border-slate-800 text-center font-bold text-slate-500">
                  + {queuedPlayers.length - 8} more waiting
                </div>
              )}
            </div>
            
            <div className="transform origin-bottom scale-90 -mb-6 mx-auto">
              <QRCodeDisplay joinCode={session.joinCode} size={200} />
            </div>
          </aside>
        </main>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}} />
    </div>
  );
}
