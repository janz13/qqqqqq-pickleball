'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { BracketTree } from '@/components/ui/BracketTree';
import { SessionType, TournamentPair, Player, TournamentMatch } from '@/types/models';
import { Users, Shuffle, Plus, Trash2, ArrowRight, RefreshCw, Edit3, CheckCircle, AlertCircle, Trophy, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { updatePoolMatchScore, advanceMatchWinner, buildPoolPlayRound, generateBracket, advanceChaosRound, checkPoolTiebreakers, buildTiebreakerMatches } from '@/engine/tournament-engine';

export default function TournamentPanel() {
  const { session, players } = useStore();
  const state = session?.tournamentState;
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null);
  const [scoreA, setScoreA] = useState(11);
  const [scoreB, setScoreB] = useState(9);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isEditingPairs, setIsEditingPairs] = useState(false);
  const [showPoolStandingsInBracket, setShowPoolStandingsInBracket] = useState(false);
  const [selectedPoolRounds, setSelectedPoolRounds] = useState(3);

  // Pair Builder State
  const [draftPairs, setDraftPairs] = useState<TournamentPair[]>([]);
  const [selectedP1, setSelectedP1] = useState<string>('');
  const [selectedP2, setSelectedP2] = useState<string>('');

  const checkedInPlayers = players.filter(p => p.status !== 'CHECKED_OUT');

  // Initialize draft pairs from locked partners or existing pairs
  useEffect(() => {
    if (state?.pairs && state.pairs.length > 0) {
      setDraftPairs(state.pairs);
      return;
    }

    // Auto-form pairs using locked partners if any
    const paired = new Set<string>();
    const initialPairs: TournamentPair[] = [];

    checkedInPlayers.forEach(p => {
      if (paired.has(p.id)) return;
      if (p.lockedPartnerId && !paired.has(p.lockedPartnerId)) {
        const partner = checkedInPlayers.find(x => x.id === p.lockedPartnerId);
        if (partner) {
          initialPairs.push({
            id: 'pair_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            player1Id: p.id,
            player2Id: partner.id,
            name: `${p.name} & ${partner.name}`,
            seed: initialPairs.length + 1,
            poolPlayWins: 0,
            poolPlayPointDiff: 0,
            poolPlayPointsScored: 0
          });
          paired.add(p.id);
          paired.add(partner.id);
        }
      }
    });

    setDraftPairs(initialPairs);
  }, [checkedInPlayers.length, state?.pairs]);

  // Unassigned players in Pair Builder
  const assignedPlayerIds = new Set<string>();
  draftPairs.forEach(p => {
    assignedPlayerIds.add(p.player1Id);
    assignedPlayerIds.add(p.player2Id);
  });
  const unassignedPlayers = checkedInPlayers.filter(p => !assignedPlayerIds.has(p.id));

  // ─── Pair Builder Actions ───
  const handleRandomizeAllPairs = () => {
    const shuffled = [...checkedInPlayers].sort(() => Math.random() - 0.5);
    const newPairs: TournamentPair[] = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        newPairs.push({
          id: 'pair_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          player1Id: shuffled[i].id,
          player2Id: shuffled[i + 1].id,
          name: `${shuffled[i].name} & ${shuffled[i + 1].name}`,
          seed: newPairs.length + 1,
          poolPlayWins: 0,
          poolPlayPointDiff: 0,
          poolPlayPointsScored: 0
        });
      }
    }
    setDraftPairs(newPairs);
  };

  const handlePairRemaining = () => {
    const shuffled = [...unassignedPlayers].sort(() => Math.random() - 0.5);
    const newPairs = [...draftPairs];
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        newPairs.push({
          id: 'pair_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          player1Id: shuffled[i].id,
          player2Id: shuffled[i + 1].id,
          name: `${shuffled[i].name} & ${shuffled[i + 1].name}`,
          seed: newPairs.length + 1,
          poolPlayWins: 0,
          poolPlayPointDiff: 0,
          poolPlayPointsScored: 0
        });
      }
    }
    setDraftPairs(newPairs);
  };

  const handleAddManualPair = () => {
    if (!selectedP1 || !selectedP2 || selectedP1 === selectedP2) return;
    const p1 = checkedInPlayers.find(p => p.id === selectedP1);
    const p2 = checkedInPlayers.find(p => p.id === selectedP2);
    if (!p1 || !p2) return;

    const newPair: TournamentPair = {
      id: 'pair_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      player1Id: p1.id,
      player2Id: p2.id,
      name: `${p1.name} & ${p2.name}`,
      seed: draftPairs.length + 1,
      poolPlayWins: 0,
      poolPlayPointDiff: 0,
      poolPlayPointsScored: 0
    };

    setDraftPairs([...draftPairs, newPair]);
    setSelectedP1('');
    setSelectedP2('');
  };

  const handleRemovePair = (pairId: string) => {
    setDraftPairs(draftPairs.filter(p => p.id !== pairId));
  };

  const handleStartWithCustomPairs = () => {
    if (draftPairs.length < 2) return;
    if (isEditingPairs && state && session) {
      const newPairs = draftPairs.map((p, idx) => ({
        ...p,
        seed: idx + 1,
        poolPlayWins: 0,
        poolPlayPointDiff: 0,
        poolPlayPointsScored: 0
      }));
      const newPoolMatches = buildPoolPlayRound({ ...state, pairs: newPairs, matches: [] }, 4);
      useStore.getState().updateSession(session.id, {
        tournamentState: {
          ...state,
          pairs: newPairs,
          matches: newPoolMatches,
          phase: 'POOL_PLAY',
          currentPoolRound: 1,
          maxPoolRounds: selectedPoolRounds
        }
      });
      setIsEditingPairs(false);
      return;
    }
    // Store the maxPoolRounds in the tournament state after initialization
    useStore.getState().startTournament('CUSTOM', draftPairs);
    // Patch in maxPoolRounds after tournament is initialized
    const currentSession = useStore.getState().session;
    if (currentSession?.tournamentState && currentSession.sessionType === SessionType.TOURNAMENT_DOUBLES) {
      useStore.getState().updateSession(currentSession.id, {
        tournamentState: {
          ...currentSession.tournamentState,
          maxPoolRounds: selectedPoolRounds
        }
      });
    }
    setIsEditingPairs(false);
  };

  // ─── No tournament state or in custom pair builder mode ───
  if (!state || state.phase === 'REGISTRATION' || isEditingPairs) {
    const canStart = session?.sessionType && session.sessionType !== 'OPEN_PLAY';
    const isDoubles = session?.sessionType === SessionType.TOURNAMENT_DOUBLES;

    return (
      <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto w-full animate-fade-in text-gray-900 dark:text-gray-100">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
          <div>
            <h2 className="text-3xl font-black tracking-tight flex items-center gap-2">
              <Trophy className="text-amber-500" />
              {isDoubles ? 'The Grand Slam: Team Setup' : 'Tournament Team Setup'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Choose who pairs with whom. You can manually pair players, randomize all, or auto-fill.
            </p>
          </div>
          {isEditingPairs && (
            <button
              onClick={() => {
                if (state?.pairs) {
                  setDraftPairs(state.pairs);
                }
                setIsEditingPairs(false);
              }}
              className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 font-bold"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRandomizeAllPairs}
            disabled={checkedInPlayers.length < 2}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold text-sm flex items-center gap-2 shadow-sm transition-all"
          >
            <Shuffle size={16} /> Randomize All Pairs
          </button>
          {unassignedPlayers.length > 1 && (
            <button
              onClick={handlePairRemaining}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center gap-2 shadow-sm transition-all"
            >
              <Users size={16} /> Auto-Pair Remaining ({unassignedPlayers.length})
            </button>
          )}
          {draftPairs.length > 0 && (
            <button
              onClick={() => setDraftPairs([])}
              className="px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-bold text-sm flex items-center gap-2 transition-all ml-auto"
            >
              <Trash2 size={16} /> Clear All
            </button>
          )}
        </div>

        {/* Manual Pair Form */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <Plus size={16} className="text-indigo-500" /> Manually Form a Pair
          </h3>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <select
              value={selectedP1}
              onChange={e => setSelectedP1(e.target.value)}
              className="flex-1 w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select Player 1...</option>
              {unassignedPlayers.map(p => (
                <option key={p.id} value={p.id}>{p.name} (Lvl {p.skillLevel})</option>
              ))}
            </select>
            <span className="font-black text-gray-400">&</span>
            <select
              value={selectedP2}
              onChange={e => setSelectedP2(e.target.value)}
              className="flex-1 w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select Player 2...</option>
              {unassignedPlayers.filter(p => p.id !== selectedP1).map(p => (
                <option key={p.id} value={p.id}>{p.name} (Lvl {p.skillLevel})</option>
              ))}
            </select>
            <button
              onClick={handleAddManualPair}
              disabled={!selectedP1 || !selectedP2}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-800 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Pair Up
            </button>
          </div>
        </div>

        {/* Unassigned Players Chip List */}
        {unassignedPlayers.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs uppercase tracking-wider mb-2">
              <AlertCircle size={16} /> Unpaired Players ({unassignedPlayers.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {unassignedPlayers.map(p => (
                <span key={p.id} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800/40 text-xs font-bold text-gray-800 dark:text-gray-200">
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Formed Pairs Grid */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Formed Teams ({draftPairs.length})
            </h3>
            <span className="text-xs text-gray-500">
              {draftPairs.length * 2} of {checkedInPlayers.length} players paired
            </span>
          </div>

          {draftPairs.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-gray-900 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 text-gray-400">
              <Users size={36} className="mx-auto mb-2 opacity-30" />
              <p className="font-bold">No teams formed yet.</p>
              <p className="text-xs mt-1">Click "Randomize All Pairs" or manually pair players above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {draftPairs.map((pair, idx) => {
                const p1 = checkedInPlayers.find(p => p.id === pair.player1Id);
                const p2 = checkedInPlayers.find(p => p.id === pair.player2Id);
                return (
                  <div key={pair.id} className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                        Team #{idx + 1}
                      </div>
                      <div className="font-extrabold text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                        {p1?.name || 'Player'} & {p2?.name || 'Player'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemovePair(pair.id)}
                      className="p-2 rounded-xl text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      title="Unpair"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pool Rounds Selector (Grand Slam only) */}
        {isDoubles && (
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-3">
              🏊 Pool Play Rounds
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              How many rounds of pool play before transitioning to the elimination bracket?
            </p>
            <div className="flex items-center gap-3">
              {[2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSelectedPoolRounds(n)}
                  className={`min-w-[52px] min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-black transition-all ${
                    selectedPoolRounds === n
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {n}
                </button>
              ))}
              <span className="text-xs font-bold text-gray-400 ml-1">rounds</span>
            </div>
          </div>
        )}

        {/* Start Button */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={handleStartWithCustomPairs}
            disabled={draftPairs.length < 2}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-black text-lg shadow-xl shadow-emerald-600/20 transition-all flex items-center justify-center gap-3"
          >
            <span>{isDoubles ? `Start ${selectedPoolRounds}-Round Pool Play with these Teams` : 'Generate Tournament with these Teams'}</span>
            <ArrowRight size={20} />
          </button>
        </div>
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
      const newPoolMatches = buildPoolPlayRound(state, 4);
      const roundNum = newPoolMatches[0]?.round ?? ((state.currentPoolRound ?? 0) + 1);
      useStore.getState().updateSession(session.id, {
        tournamentState: {
          ...state,
          matches: [...state.matches, ...newPoolMatches],
          phase: 'POOL_PLAY',
          currentPoolRound: roundNum
        }
      });
    }
  };

  const handleGenerateBracket = () => {
    if (session && state) {
      // Check for tiebreakers at the UB/LB cutline before generating bracket
      const { needsTiebreaker, tiedPairIds } = checkPoolTiebreakers(state);
      if (needsTiebreaker && !state.tiebreakerPhase) {
        // Generate tiebreaker matches instead of bracket
        const tbMatches = buildTiebreakerMatches(state, tiedPairIds);
        useStore.getState().updateSession(session.id, {
          tournamentState: {
            ...state,
            matches: [...state.matches, ...tbMatches],
            tiebreakerPhase: true
          }
        });
        return;
      }
      const newState = generateBracket(state, session.sessionType!);
      useStore.getState().updateSession(session.id, {
        tournamentState: newState
      });
    }
  };

  const handleSaveTiebreakerScore = (matchId: string) => {
    if (session && state && scoreA !== scoreB) {
      const newState = updatePoolMatchScore(state, matchId, scoreA, scoreB);
      // Check if all tiebreaker matches are now completed
      const tbMatches = newState.matches.filter(m => m.id.startsWith('pool_tiebreaker_'));
      const allTbDone = tbMatches.length > 0 && tbMatches.every(m => m.status === 'COMPLETED');
      
      if (allTbDone) {
        // All tiebreakers resolved — now generate the bracket
        const bracketState = generateBracket(
          { ...newState, tiebreakerPhase: false },
          session.sessionType!
        );
        useStore.getState().updateSession(session.id, {
          tournamentState: bracketState
        });
      } else {
        useStore.getState().updateSession(session.id, {
          tournamentState: newState
        });
      }
      setScoringMatchId(null);
    }
  };

  const handleAdvanceBracketMatch = (matchId: string, winnerTeamId: string, customScoreA?: number, customScoreB?: number) => {
    if (session && state) {
      const newState = advanceMatchWinner(state, matchId, winnerTeamId, customScoreA, customScoreB);

      // Check if tournament is done (NOT for Chaos — Chaos uses advanceChaosRound)
      const isChaos = session.sessionType === SessionType.TOURNAMENT_CHAOS;
      const bracketMatches = newState.matches.filter(m => !m.id.startsWith('pool_match_'));
      const allCompleted = !isChaos && bracketMatches.length > 0 && bracketMatches.every(m => m.status === 'COMPLETED');
      
      useStore.getState().updateSession(session.id, {
        tournamentState: {
          ...newState,
          phase: isChaos ? 'BRACKET' : (allCompleted ? 'COMPLETED' : newState.phase)
        }
      });
    }
  };

  const handleSavePoolScore = (matchId: string) => {
    if (session && state) {
      const newState = updatePoolMatchScore(state, matchId, scoreA, scoreB);
      useStore.getState().updateSession(session.id, {
        tournamentState: newState
      });
      setScoringMatchId(null);
    }
  };

  const handleSaveChaosScore = (matchId: string) => {
    if (session && state) {
      const match = state.matches.find(m => m.id === matchId);
      if (!match || scoreA === scoreB) return;
      const winnerTeamId = scoreA > scoreB ? match.teamAId! : match.teamBId!;
      handleAdvanceBracketMatch(matchId, winnerTeamId, scoreA, scoreB);
      setScoringMatchId(null);
    }
  };

  const handleSwapPoolScores = () => {
    const s1 = scoreA;
    const s2 = scoreB;
    setScoreA(s2);
    setScoreB(s1);
  };

  const handleOpenPoolScoring = (match: TournamentMatch) => {
    setScoringMatchId(match.id);
    setScoreA(match.scoreA ?? 11);
    setScoreB(match.scoreB ?? 9);
  };

  const handleOpenChaosScoring = (match: TournamentMatch) => {
    setScoringMatchId(match.id);
    setScoreA(match.scoreA ?? 11);
    setScoreB(match.scoreB ?? 9);
  };

  const handleResetTournament = () => {
    if (session) {
      useStore.getState().updateSession(session.id, { tournamentState: undefined });
      setShowResetConfirm(false);
      setIsEditingPairs(false);
    }
  };

  const handleAdvanceChaosRound = () => {
    if (session && state) {
      const newState = advanceChaosRound(state, players);
      useStore.getState().updateSession(session.id, {
        tournamentState: newState
      });
    }
  };

  // ─── Mapped bracket data for BracketTree ───
  const mappedBracketMatches = matches
    .filter(m => !m.id.startsWith('pool_match_') && !m.id.startsWith('pool_tiebreaker_'))
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
        winner: winnerName,
        isLosersBracket: m.isLosersBracket,
        isGrandFinals: m.id.startsWith('gf_'),
        isBestOf3: m.isBestOf3,
        games: m.games,
        is3rdPlaceMatch: m.is3rdPlaceMatch ?? m.id.startsWith('3rd_place_'),
      };
    });

  // ─── Pool play status ───
  const poolMatches = matches.filter(m => m.id.startsWith('pool_match_'));
  const tiebreakerMatches = matches.filter(m => m.id.startsWith('pool_tiebreaker_'));
  const completedPoolMatches = poolMatches.filter(m => m.status === 'COMPLETED');
  const pendingPoolMatches = poolMatches.filter(m => m.status !== 'COMPLETED');
  const allPoolDone = poolMatches.length > 0 && pendingPoolMatches.length === 0;
  const currentPoolRound = state?.currentPoolRound ?? (poolMatches.length > 0 ? Math.max(...poolMatches.map(m => m.round)) : 0);
  const maxPoolRounds = state?.maxPoolRounds ?? 0;
  const reachedMaxRounds = maxPoolRounds > 0 && currentPoolRound >= maxPoolRounds;
  const canAddMoreRounds = allPoolDone && !reachedMaxRounds;
  const allTiebreakersDone = tiebreakerMatches.length > 0 && tiebreakerMatches.every(m => m.status === 'COMPLETED');
  const inTiebreakerPhase = state?.tiebreakerPhase === true;

  // ─── Chaos status ───
  const chaosMatches = matches.filter(m => !m.id.startsWith('pool_match_') && !m.id.startsWith('pool_tiebreaker_'));
  const maxRound = chaosMatches.length > 0 ? Math.max(...chaosMatches.map(m => m.round)) : 0;
  const currentRoundMatches = chaosMatches.filter(m => m.round === maxRound);
  const canAdvanceChaos = currentRoundMatches.length > 0 && currentRoundMatches.every(m => m.status === 'COMPLETED');
  const chaosRounds = Array.from(new Set(chaosMatches.map(m => m.round))).sort((a, b) => b - a);
  const round1Matches = chaosMatches.filter(m => m.round === 1);
  const totalChaosTeams = round1Matches.reduce((count, m) => count + (m.teamAId ? 1 : 0) + (m.teamBId ? 1 : 0), 0);
  const eliminatedChaosTeamsCount = chaosMatches.filter(m => m.status === 'COMPLETED' && m.teamAId && m.teamBId).length;
  const remainingChaosTeamsCount = phase === 'COMPLETED' ? 1 : Math.max(1, totalChaosTeams - eliminatedChaosTeamsCount);

  const lastCompletedChaosMatch = [...chaosMatches]
    .filter(m => m.status === 'COMPLETED' && m.winnerTeamId)
    .sort((a, b) => b.round - a.round || b.matchNumber - a.matchNumber)[0];
  const chaosChampionId = lastCompletedChaosMatch?.winnerTeamId;
  const chaosChampionName = chaosChampionId ? getTeamName(chaosChampionId) : null;
  const chaosChampionPair = pairs.find(p => p.id === chaosChampionId);
  const chaosChampionP1 = chaosChampionPair ? players.find(p => p.id === chaosChampionPair.player1Id) : null;
  const chaosChampionP2 = chaosChampionPair ? players.find(p => p.id === chaosChampionPair.player2Id) : null;

  // ─── Tournament mode label ───
  const modeLabel = session?.sessionType === SessionType.TOURNAMENT_DOUBLES ? '🏆 The Grand Slam' 
    : session?.sessionType === SessionType.TOURNAMENT_SINGLE_ELIM ? '⚡ Knockout Sprint' 
    : '🌪️ Chaos Roulette';

  // ─── Helper: Render Chaos round-by-round card layout ───
  const renderChaosRoundView = (isReadOnly: boolean = false) => (
    <div className="flex flex-col gap-6">
      {/* Surviving / Eliminated Teams Info Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="px-3.5 py-1.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 font-black text-xs uppercase tracking-wider border border-indigo-200 dark:border-indigo-800/60">
            {remainingChaosTeamsCount} {remainingChaosTeamsCount === 1 ? 'team' : 'teams'} remaining
          </span>
          <span className="px-3.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-black text-xs uppercase tracking-wider border border-rose-200 dark:border-rose-900/60">
            {eliminatedChaosTeamsCount} {eliminatedChaosTeamsCount === 1 ? 'team' : 'teams'} eliminated
          </span>
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
            Round {maxRound} • {chaosMatches.length} total matches
          </span>
        </div>

        {!isReadOnly && canAdvanceChaos && (
          <button
            onClick={handleAdvanceChaosRound}
            className="min-h-[44px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-md transition-all flex items-center gap-2 animate-pulse-soft"
          >
            <span>🌪️ Generate Next Chaos Round</span>
            <ArrowRight size={16} />
          </button>
        )}
      </div>

      {/* Rounds in Descending Order (newest round at top) */}
      {chaosRounds.map(roundNum => {
        const roundMatches = chaosMatches.filter(m => m.round === roundNum);
        const completedInRound = roundMatches.filter(m => m.status === 'COMPLETED').length;
        const isCurrentRound = roundNum === maxRound;
        const allRoundDone = roundMatches.length > 0 && roundMatches.every(m => m.status === 'COMPLETED');

        return (
          <div key={roundNum} className="flex flex-col gap-4">
            {/* Round Header */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  🌪️ Round {roundNum}
                </h3>
                {isCurrentRound && !isReadOnly && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Active Round
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                  {completedInRound} of {roundMatches.length} matches completed
                </span>
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider ${
                  allRoundDone 
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60' 
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                }`}>
                  {allRoundDone ? '✓ Completed' : 'Pending'}
                </span>
              </div>
            </div>

            {/* Advance Notice Banner for Current Completed Round */}
            {!isReadOnly && isCurrentRound && allRoundDone && (
              <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h4 className="text-sm font-black text-indigo-900 dark:text-indigo-200">
                    Round {roundNum} Matches Finished!
                  </h4>
                  <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                    All matches have been scored. Generate the next Chaos round to re-pair surviving players!
                  </p>
                </div>
                <button
                  onClick={handleAdvanceChaosRound}
                  className="min-h-[44px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 animate-pulse-soft"
                >
                  <span>🌪️ Generate Next Chaos Round</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            )}

            {/* Match Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roundMatches.map(match => {
                const isDone = match.status === 'COMPLETED';
                const hasBye = !match.teamBId;
                const isWinnerA = match.winnerTeamId === match.teamAId && isDone;
                const isWinnerB = match.winnerTeamId === match.teamBId && isDone;

                return (
                  <div
                    key={match.id}
                    className={`p-5 rounded-2xl shadow-sm border transition-all ${
                      isDone 
                        ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800' 
                        : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-indigo-400 dark:hover:border-indigo-600'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Match #{match.matchNumber} (Round {match.round})
                      </span>
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider ${
                        isDone 
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60' 
                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                      }`}>
                        {isDone ? (hasBye ? '✓ Bye Advance' : '✓ Completed') : 'Pending'}
                      </span>
                    </div>

                    {/* Team A Row */}
                    <div className={`flex justify-between items-center py-2.5 px-3 rounded-xl transition-all ${
                      isWinnerA 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/40 font-black' 
                        : 'text-gray-900 dark:text-gray-100 font-bold'
                    }`}>
                      <span className="truncate mr-2 flex items-center gap-2">
                        {isWinnerA && <span className="text-emerald-500 font-black">🏆</span>}
                        {getTeamName(match.teamAId)}
                      </span>
                      <span className="font-mono font-black text-xl">{match.scoreA ?? (hasBye ? 'W' : '-')}</span>
                    </div>

                    {/* Team B Row */}
                    <div className={`flex justify-between items-center py-2.5 px-3 rounded-xl mt-1 transition-all ${
                      isWinnerB 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/40 font-black' 
                        : 'text-gray-900 dark:text-gray-100 font-bold'
                    }`}>
                      <span className="truncate mr-2 flex items-center gap-2">
                        {isWinnerB && <span className="text-emerald-500 font-black">🏆</span>}
                        {hasBye ? <span className="text-gray-400 italic">BYE (Auto-advance)</span> : getTeamName(match.teamBId)}
                      </span>
                      <span className="font-mono font-black text-xl">{hasBye ? '-' : (match.scoreB ?? '-')}</span>
                    </div>

                    {/* Score Input Box or Action */}
                    {!isReadOnly && !hasBye && (
                      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                        {scoringMatchId === match.id ? (
                          <div className="space-y-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 animate-slide-up">
                            <div className="flex items-center gap-2 justify-between flex-wrap">
                              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {isDone ? 'Edit Score' : 'Enter Score'}
                              </span>
                              <button
                                type="button"
                                onClick={handleSwapPoolScores}
                                className="min-h-[44px] px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                              >
                                <RefreshCw size={14} /> Swap Scores / Winner
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3 items-center">
                              <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block truncate">
                                  {getTeamName(match.teamAId)}
                                </label>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setScoreA(Math.max(0, scoreA - 1))}
                                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center text-lg active:scale-95 transition-transform"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    max="99"
                                    value={scoreA}
                                    onChange={e => setScoreA(parseInt(e.target.value) || 0)}
                                    className="w-full h-11 min-h-[44px] text-center font-black text-lg bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl py-1"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setScoreA(scoreA + 1)}
                                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center text-lg active:scale-95 transition-transform"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block truncate">
                                  {getTeamName(match.teamBId)}
                                </label>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setScoreB(Math.max(0, scoreB - 1))}
                                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center text-lg active:scale-95 transition-transform"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    max="99"
                                    value={scoreB}
                                    onChange={e => setScoreB(parseInt(e.target.value) || 0)}
                                    className="w-full h-11 min-h-[44px] text-center font-black text-lg bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl py-1"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setScoreB(scoreB + 1)}
                                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center text-lg active:scale-95 transition-transform"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>

                            {scoreA === scoreB ? (
                              <p className="text-xs text-rose-500 font-semibold text-center">Scores must differ to determine a winner.</p>
                            ) : (
                              <div className="text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                Winner: {scoreA > scoreB ? getTeamName(match.teamAId) : getTeamName(match.teamBId)}
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setScoringMatchId(null)}
                                className="flex-1 min-h-[44px] py-2.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-100 dark:hover:bg-gray-800"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveChaosScore(match.id)}
                                disabled={scoreA === scoreB}
                                className="flex-1 min-h-[44px] py-2.5 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-black shadow-md transition-all"
                              >
                                {isDone ? 'Update Score' : 'Save Score'}
                              </button>
                            </div>
                          </div>
                        ) : isDone ? (
                          <button
                            type="button"
                            onClick={() => handleOpenChaosScoring(match)}
                            className="w-full min-h-[44px] py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Edit3 size={14} /> Edit Score / Winner
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenChaosScoring(match)}
                            className="w-full min-h-[44px] py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
                          >
                            Enter Score
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-y-auto text-gray-900 dark:text-gray-100 max-w-7xl mx-auto w-full">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight">{modeLabel}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
            {pairs.length} teams • {matches.length} total matches
          </p>
        </div>
        <div className="flex items-center gap-3">
          {completedPoolMatches.length === 0 && phase === 'POOL_PLAY' && (
            <button
              onClick={() => setIsEditingPairs(true)}
              className="px-3 py-1.5 text-xs font-bold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Users size={14} /> Edit Pairs
            </button>
          )}
          <div className={`px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
            phase === 'COMPLETED' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' :
            phase === 'BRACKET' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800' :
            phase === 'POOL_PLAY' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800' :
            'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
          }`}>
            {phase === 'COMPLETED' ? '✅ Completed' : phase === 'BRACKET' ? '🏟️ Bracket' : phase === 'POOL_PLAY' ? '🏊 Pool Play' : '📋 Registration'}
          </div>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/60 transition-colors"
          >
            Reset Tournament
          </button>
        </div>
      </div>

      {/* ─── Reset Confirmation ─── */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
            <h3 className="text-lg font-black text-rose-600">Reset Tournament?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This will erase all tournament progress including brackets, pool play results, and pairs. This cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowResetConfirm(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 text-sm">
                Cancel
              </button>
              <button onClick={handleResetTournament} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md">
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── POOL PLAY Phase ─── */}
      {phase === 'POOL_PLAY' && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h3 className="text-2xl font-black">Pool Play Matches</h3>
              <p className="text-xs text-gray-500 font-semibold mt-0.5">
                {completedPoolMatches.length} of {poolMatches.length} matches completed
                {maxPoolRounds > 0 && ` • Round ${currentPoolRound} of ${maxPoolRounds}`}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Next Pool Round button — hidden when max rounds reached or tiebreaker phase */}
              {canAddMoreRounds && !inTiebreakerPhase && (
                <button onClick={handleStartPoolPlay} className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition-all">
                  Next Pool Round →
                </button>
              )}
              {/* Generate Bracket button — show when reached max rounds OR manually when all done */}
              {allPoolDone && (reachedMaxRounds || !maxPoolRounds) && !inTiebreakerPhase && (
                <button onClick={handleGenerateBracket} className="min-h-[44px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-black shadow-lg shadow-emerald-600/20 transition-all animate-pulse-soft flex items-center gap-2">
                  <span>🏟️ Generate Double Elimination Bracket</span>
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Pool rounds reached banner */}
          {allPoolDone && reachedMaxRounds && !inTiebreakerPhase && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
              <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                ✅ All {maxPoolRounds} Pool Play Rounds Complete!
              </h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium mt-1">
                Pool play is done. Generate the bracket to begin the elimination phase. Top half will enter the Upper Bracket with double-elimination advantage, bottom half enters Lower Bracket directly.
              </p>
            </div>
          )}

          {/* Tiebreaker Phase Banner & Matches */}
          {inTiebreakerPhase && (
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700/60 animate-slide-up">
                <h4 className="text-sm font-black text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  ⚖️ Tiebreaker Matches Required!
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mt-1">
                  Teams are tied at the Upper/Lower bracket cutline. These tiebreaker matches must be completed to determine bracket placement.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tiebreakerMatches.map(match => {
                  const isDone = match.status === 'COMPLETED';
                  const isWinnerA = match.winnerTeamId === match.teamAId && isDone;
                  const isWinnerB = match.winnerTeamId === match.teamBId && isDone;
                  return (
                    <div key={match.id} className={`p-5 rounded-2xl shadow-sm border-2 transition-all ${
                      isDone 
                        ? 'bg-white dark:bg-gray-900 border-emerald-200 dark:border-emerald-800' 
                        : 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700'
                    }`}>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                          ⚖️ Tiebreaker
                        </span>
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider ${
                          isDone 
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60' 
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                        }`}>
                          {isDone ? '✓ Decided' : 'Must Play'}
                        </span>
                      </div>
                      <div className={`flex justify-between items-center py-2.5 px-3 rounded-xl transition-all ${
                        isWinnerA 
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/40 font-black' 
                          : 'text-gray-900 dark:text-gray-100 font-bold'
                      }`}>
                        <span className="truncate mr-2 flex items-center gap-2">
                          {isWinnerA && <span className="text-emerald-500 font-black">↑ UB</span>}
                          {getTeamName(match.teamAId)}
                        </span>
                        <span className="font-mono font-black text-xl">{match.scoreA ?? '-'}</span>
                      </div>
                      <div className={`flex justify-between items-center py-2.5 px-3 rounded-xl mt-1 transition-all ${
                        isWinnerB 
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/40 font-black' 
                          : 'text-gray-900 dark:text-gray-100 font-bold'
                      }`}>
                        <span className="truncate mr-2 flex items-center gap-2">
                          {isWinnerB && <span className="text-emerald-500 font-black">↑ UB</span>}
                          {getTeamName(match.teamBId)}
                        </span>
                        <span className="font-mono font-black text-xl">{match.scoreB ?? '-'}</span>
                      </div>
                      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                        {scoringMatchId === match.id ? (
                          <div className="space-y-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 animate-slide-up">
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              {isDone ? 'Edit Score' : 'Enter Score'}
                            </span>
                            <div className="grid grid-cols-2 gap-3 items-center">
                              <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block truncate">{getTeamName(match.teamAId)}</label>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => setScoreA(Math.max(0, scoreA - 1))} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center">-</button>
                                  <input type="number" min="0" max="99" value={scoreA} onChange={e => setScoreA(parseInt(e.target.value) || 0)} className="w-full text-center font-black text-lg bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg py-1" />
                                  <button onClick={() => setScoreA(scoreA + 1)} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center">+</button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block truncate">{getTeamName(match.teamBId)}</label>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => setScoreB(Math.max(0, scoreB - 1))} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center">-</button>
                                  <input type="number" min="0" max="99" value={scoreB} onChange={e => setScoreB(parseInt(e.target.value) || 0)} className="w-full text-center font-black text-lg bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg py-1" />
                                  <button onClick={() => setScoreB(scoreB + 1)} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center">+</button>
                                </div>
                              </div>
                            </div>
                            {scoreA === scoreB ? (
                              <p className="text-xs text-rose-500 font-semibold text-center">Scores must differ to determine a winner.</p>
                            ) : (
                              <div className="text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                Winner (→ UB): {scoreA > scoreB ? getTeamName(match.teamAId) : getTeamName(match.teamBId)}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button onClick={() => setScoringMatchId(null)} className="flex-1 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
                              <button onClick={() => handleSaveTiebreakerScore(match.id)} disabled={scoreA === scoreB} className="flex-1 py-2 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-black shadow-md transition-all">
                                {isDone ? 'Update Score' : 'Save Score'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenPoolScoring(match)}
                            className={`w-full py-3 rounded-xl text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 ${
                              isDone 
                                ? 'border border-gray-200 dark:border-gray-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-black uppercase tracking-wider' 
                                : 'bg-amber-600 hover:bg-amber-700 text-white'
                            }`}
                          >
                            {isDone ? <><Edit3 size={14} /> Edit Score</> : 'Enter Tiebreaker Score'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pool Standings */}
          {poolMatches.length > 0 && (() => {
            const sortedStandings = [...pairs].sort((a, b) => b.poolPlayWins - a.poolPlayWins || b.poolPlayPointDiff - a.poolPlayPointDiff || b.poolPlayPointsScored - a.poolPlayPointsScored);
            const cutline = Math.ceil(sortedStandings.length / 2);
            return (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                <h4 className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Shield size={14} className="text-indigo-500" /> Pool Standings
                </h4>
                <span className="text-xs text-gray-400 font-medium">Top {cutline} → Upper Bracket • Bottom {sortedStandings.length - cutline} → Lower Bracket</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {sortedStandings.map((pair, idx) => (
                  <React.Fragment key={pair.id}>
                    {/* UB/LB Cutline divider */}
                    {idx === cutline && (
                      <div className="px-5 py-2 bg-gradient-to-r from-rose-50 via-rose-100 to-rose-50 dark:from-rose-950/40 dark:via-rose-950/60 dark:to-rose-950/40 flex items-center gap-2">
                        <div className="flex-1 h-px bg-rose-300 dark:bg-rose-700" />
                        <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest whitespace-nowrap">
                          ↓ Lower Bracket Cutline ↓
                        </span>
                        <div className="flex-1 h-px bg-rose-300 dark:bg-rose-700" />
                      </div>
                    )}
                    <div className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black ${
                          idx < cutline ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="font-extrabold text-sm text-gray-900 dark:text-gray-100">
                          {pair.name || getTeamName(pair.id)}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider ${
                          idx < cutline 
                            ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                            : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40'
                        }`}>
                          {idx < cutline ? 'UB' : 'LB'}
                        </span>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="text-emerald-600 dark:text-emerald-400 font-black">{pair.poolPlayWins}W</span>
                        <span className="text-xs text-gray-400 font-medium">{pair.poolPlayPointsScored} Pts</span>
                        <span className={`font-mono font-bold text-xs ${pair.poolPlayPointDiff > 0 ? 'text-emerald-600 dark:text-emerald-400' : pair.poolPlayPointDiff < 0 ? 'text-rose-500' : 'text-gray-400'}`}>
                          {pair.poolPlayPointDiff > 0 ? '+' : ''}{pair.poolPlayPointDiff}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
            );
          })()}

          {/* Pool Match Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {poolMatches.map(match => {
              const isDone = match.status === 'COMPLETED';
              const isWinnerA = match.winnerTeamId === match.teamAId && isDone;
              const isWinnerB = match.winnerTeamId === match.teamBId && isDone;

              return (
                <div
                  key={match.id}
                  className={`p-5 rounded-2xl shadow-sm border transition-all ${
                    isDone 
                      ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800' 
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-indigo-400 dark:hover:border-indigo-600'
                  }`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Match #{match.matchNumber} (Round {match.round})
                    </span>
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider ${
                      isDone 
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60' 
                        : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                    }`}>
                      {isDone ? '✓ Completed' : 'Pending'}
                    </span>
                  </div>

                  {/* Team A Row */}
                  <div className={`flex justify-between items-center py-2.5 px-3 rounded-xl transition-all ${
                    isWinnerA 
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/40 font-black' 
                      : 'text-gray-900 dark:text-gray-100 font-bold'
                  }`}>
                    <span className="truncate mr-2 flex items-center gap-2">
                      {isWinnerA && <span className="text-emerald-500 font-black">🏆</span>}
                      {getTeamName(match.teamAId)}
                    </span>
                    <span className="font-mono font-black text-xl">{match.scoreA ?? '-'}</span>
                  </div>

                  {/* Team B Row */}
                  <div className={`flex justify-between items-center py-2.5 px-3 rounded-xl mt-1 transition-all ${
                    isWinnerB 
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/40 font-black' 
                      : 'text-gray-900 dark:text-gray-100 font-bold'
                  }`}>
                    <span className="truncate mr-2 flex items-center gap-2">
                      {isWinnerB && <span className="text-emerald-500 font-black">🏆</span>}
                      {getTeamName(match.teamBId)}
                    </span>
                    <span className="font-mono font-black text-xl">{match.scoreB ?? '-'}</span>
                  </div>

                  {/* Score Input Box or Edit Action */}
                  <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                    {scoringMatchId === match.id ? (
                      <div className="space-y-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 animate-slide-up">
                        <div className="flex items-center gap-2 justify-between">
                          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {isDone ? 'Edit Score' : 'Enter Score'}
                          </span>
                          <button
                            type="button"
                            onClick={handleSwapPoolScores}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-bold flex items-center gap-1 hover:bg-indigo-100 transition-colors"
                          >
                            <RefreshCw size={12} /> Swap Scores / Winner
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 items-center">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block truncate">
                              {getTeamName(match.teamAId)}
                            </label>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setScoreA(Math.max(0, scoreA - 1))} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center">-</button>
                              <input
                                type="number"
                                min="0"
                                max="99"
                                value={scoreA}
                                onChange={e => setScoreA(parseInt(e.target.value) || 0)}
                                className="w-full text-center font-black text-lg bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg py-1"
                              />
                              <button onClick={() => setScoreA(scoreA + 1)} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center">+</button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block truncate">
                              {getTeamName(match.teamBId)}
                            </label>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setScoreB(Math.max(0, scoreB - 1))} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center">-</button>
                              <input
                                type="number"
                                min="0"
                                max="99"
                                value={scoreB}
                                onChange={e => setScoreB(parseInt(e.target.value) || 0)}
                                className="w-full text-center font-black text-lg bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg py-1"
                              />
                              <button onClick={() => setScoreB(scoreB + 1)} className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 font-bold flex items-center justify-center">+</button>
                            </div>
                          </div>
                        </div>

                        {scoreA === scoreB ? (
                          <p className="text-xs text-rose-500 font-semibold text-center">Scores must differ to determine a winner.</p>
                        ) : (
                          <div className="text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            Winner: {scoreA > scoreB ? getTeamName(match.teamAId) : getTeamName(match.teamBId)}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={() => setScoringMatchId(null)}
                            className="flex-1 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSavePoolScore(match.id)}
                            disabled={scoreA === scoreB}
                            className="flex-1 py-2 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-black shadow-md transition-all"
                          >
                            {isDone ? 'Update Score' : 'Save Score'}
                          </button>
                        </div>
                      </div>
                    ) : isDone ? (
                      <button
                        onClick={() => handleOpenPoolScoring(match)}
                        className="w-full py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Edit3 size={14} /> Edit Score / Winner
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenPoolScoring(match)}
                        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
                      >
                        Enter Score
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── BRACKET Phase ─── */}
      {phase === 'BRACKET' && (
        <div className="flex flex-col gap-6">
          {session?.sessionType === SessionType.TOURNAMENT_CHAOS ? (
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                  <h3 className="text-2xl font-black">Chaos Roulette Rounds</h3>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">
                    Score matches to determine advancing players. Survivors re-pair after each round.
                  </p>
                </div>
                {canAdvanceChaos && (
                  <button
                    onClick={handleAdvanceChaosRound}
                    className="min-h-[44px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-md transition-all flex items-center gap-2 animate-pulse-soft"
                  >
                    <span>🌪️ Generate Next Chaos Round</span>
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>

              {renderChaosRoundView(false)}
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                  <h3 className="text-2xl font-black">Bracket Phase</h3>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">
                    Click any match to score it, edit scores, or swap winners.
                  </p>
                </div>
              </div>

              {/* Collapsible Pool Play Standings */}
              {poolMatches.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowPoolStandingsInBracket(!showPoolStandingsInBracket)}
                    className="w-full px-5 py-3.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Shield size={16} className="text-indigo-500" />
                      <span className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest">
                        Pool Play Standings ({completedPoolMatches.length} Matches Completed)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                      <span>{showPoolStandingsInBracket ? 'Hide Standings' : 'View Standings'}</span>
                      {showPoolStandingsInBracket ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>
                  {showPoolStandingsInBracket && (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {[...pairs].sort((a, b) => (b.poolPlayWins ?? 0) - (a.poolPlayWins ?? 0) || (b.poolPlayPointDiff ?? 0) - (a.poolPlayPointDiff ?? 0)).map((pair, idx) => (
                        <div key={pair.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black ${
                              idx < 3 ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="font-extrabold text-sm text-gray-900 dark:text-gray-100">
                              {pair.name || getTeamName(pair.id)}
                            </span>
                          </div>
                          <div className="flex items-center gap-6 text-sm">
                            <span className="text-emerald-600 dark:text-emerald-400 font-black">{pair.poolPlayWins ?? 0}W</span>
                            <span className="text-xs text-gray-400 font-medium">{pair.poolPlayPointsScored ?? 0} Pts</span>
                            <span className={`font-mono font-bold text-xs ${(pair.poolPlayPointDiff ?? 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : (pair.poolPlayPointDiff ?? 0) < 0 ? 'text-rose-500' : 'text-gray-400'}`}>
                              {(pair.poolPlayPointDiff ?? 0) > 0 ? '+' : ''}{pair.poolPlayPointDiff ?? 0}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <BracketTree matches={mappedBracketMatches} onMatchClick={handleAdvanceBracketMatch} />
            </>
          )}
        </div>
      )}
      
      {/* ─── COMPLETED Phase ─── */}
      {phase === 'COMPLETED' && (
        <div className="flex flex-col gap-6">
          {session?.sessionType === SessionType.TOURNAMENT_CHAOS ? (
            <div className="flex flex-col gap-6">
              {/* Champion Showcase Banner */}
              <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-2 border-amber-500/40 dark:border-amber-500/50 rounded-3xl p-6 sm:p-8 text-center shadow-xl space-y-4 animate-slide-up">
                <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-inner">
                  <Trophy size={40} />
                </div>
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                    🏆 Chaos Roulette Champion
                  </span>
                  <h3 className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-gray-100 mt-1">
                    {chaosChampionName || 'Tournament Winner'}
                  </h3>
                  {chaosChampionP1 && chaosChampionP2 && (
                    <p className="text-sm sm:text-base font-bold text-gray-700 dark:text-gray-300 mt-1">
                      {chaosChampionP1.name} & {chaosChampionP2.name}
                    </p>
                  )}
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-semibold mt-1">
                    Survived all {maxRound} rounds and conquered the roulette wheel!
                  </p>
                </div>
              </div>

              {/* Read-only Chaos Rounds list */}
              {renderChaosRoundView(true)}
            </div>
          ) : (
            <BracketTree matches={mappedBracketMatches} onMatchClick={handleAdvanceBracketMatch} />
          )}
        </div>
      )}
    </div>
  );
}
