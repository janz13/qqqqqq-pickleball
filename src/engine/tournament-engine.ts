import { Player, TournamentState, TournamentPair, TournamentMatch, SessionType, Team } from '@/types/models';

/**
 * Generates an initial tournament state from a list of players.
 */
export function initializeTournament(players: Player[], type: SessionType, pairingStrategy: 'RANDOM' | 'LOCKED' = 'RANDOM'): TournamentState {
  const availablePlayers = players.filter(p => p.status !== 'CHECKED_OUT');
  
  const pairs: TournamentPair[] = [];
  
  if (pairingStrategy === 'LOCKED') {
    // First, pair up locked partners
    const pairedIds = new Set<string>();
    for (const p of availablePlayers) {
      if (pairedIds.has(p.id)) continue;
      
      if (p.lockedPartnerId && !pairedIds.has(p.lockedPartnerId)) {
        const partner = availablePlayers.find(x => x.id === p.lockedPartnerId);
        if (partner) {
          pairs.push({
            id: `pair_${pairs.length + 1}`,
            player1Id: p.id,
            player2Id: partner.id,
            name: `${p.name} & ${partner.name}`,
            seed: pairs.length + 1,
            poolPlayWins: 0,
            poolPlayPointDiff: 0,
            poolPlayPointsScored: 0
          });
          pairedIds.add(p.id);
          pairedIds.add(partner.id);
        }
      }
    }
    
    // Then randomly pair the rest
    const remaining = availablePlayers.filter(p => !pairedIds.has(p.id)).sort(() => Math.random() - 0.5);
    for (let i = 0; i < remaining.length; i += 2) {
      if (i + 1 < remaining.length) {
        pairs.push({
          id: `pair_${pairs.length + 1}`,
          player1Id: remaining[i].id,
          player2Id: remaining[i + 1].id,
          name: `${remaining[i].name} & ${remaining[i + 1].name}`,
          seed: pairs.length + 1,
          poolPlayWins: 0,
          poolPlayPointDiff: 0,
          poolPlayPointsScored: 0
        });
      }
    }
  } else {
    // Completely random
    const shuffled = [...availablePlayers].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        pairs.push({
          id: `pair_${pairs.length + 1}`,
          player1Id: shuffled[i].id,
          player2Id: shuffled[i + 1].id,
          name: `${shuffled[i].name} & ${shuffled[i + 1].name}`,
          seed: pairs.length + 1,
          poolPlayWins: 0,
          poolPlayPointDiff: 0,
          poolPlayPointsScored: 0
        });
      }
    }
  }

  let phase: 'REGISTRATION' | 'POOL_PLAY' | 'BRACKET' | 'COMPLETED' = 'BRACKET';
  if (type === SessionType.TOURNAMENT_DOUBLES) phase = 'POOL_PLAY';

  const matches: TournamentMatch[] = [];

  // For Chaos Roulette, build the first round immediately as "BRACKET" phase.
  if (type === SessionType.TOURNAMENT_CHAOS) {
    // Generate Round 1 matches for the initial pairs
    for (let i = 0; i < pairs.length; i += 2) {
      matches.push({
        id: `chaos_match_${(i/2) + 1}`,
        round: 1,
        isLosersBracket: false,
        matchNumber: (i/2) + 1,
        nextMatchId: null,
        nextLoserMatchId: null,
        teamAId: pairs[i].id,
        teamBId: (i + 1 < pairs.length) ? pairs[i + 1].id : null, // Bye if odd number of pairs
        courtId: null,
        status: (i + 1 < pairs.length) ? 'PENDING' : 'COMPLETED',
        startedAtEpochMs: null,
        endedAtEpochMs: (i + 1 < pairs.length) ? null : Date.now(),
        winnerTeamId: (i + 1 < pairs.length) ? null : pairs[i].id,
        scoreA: null,
        scoreB: null,
        isBestOf3: false,
        games: []
      });
    }
  }

  let state: TournamentState = {
    pairs,
    matches,
    phase
  };

  // For Knockout Sprint, generate the bracket immediately
  if (type === SessionType.TOURNAMENT_SINGLE_ELIM) {
    state = generateBracket(state, type);
  }

  // For Doubles (Grand Slam), generate the first pool round immediately
  if (type === SessionType.TOURNAMENT_DOUBLES) {
    state.matches = buildPoolPlayRound(state, 4);
  }

  return state;
}

/**
 * Builds the next round of pool play matches using a simple Swiss system.
 */
export function buildPoolPlayRound(state: TournamentState, courtsCount: number): TournamentMatch[] {
  // Sort pairs by wins, then point diff
  const sortedPairs = [...state.pairs].sort((a, b) => {
    if (a.poolPlayWins !== b.poolPlayWins) return b.poolPlayWins - a.poolPlayWins;
    return b.poolPlayPointDiff - a.poolPlayPointDiff;
  });

  const newMatches: TournamentMatch[] = [];
  const activeMatchIds = state.matches.length;

  for (let i = 0; i < sortedPairs.length; i += 2) {
    if (i + 1 < sortedPairs.length) {
      newMatches.push({
        id: `pool_match_${activeMatchIds + (i/2) + 1}`,
        round: Math.floor(state.matches.length / (state.pairs.length / 2)) + 1,
        isLosersBracket: false,
        matchNumber: activeMatchIds + (i/2) + 1,
        nextMatchId: null,
        nextLoserMatchId: null,
        teamAId: sortedPairs[i].id,
        teamBId: sortedPairs[i + 1].id,
        courtId: null,
        status: 'PENDING',
        startedAtEpochMs: null,
        endedAtEpochMs: null,
        winnerTeamId: null,
        scoreA: null,
        scoreB: null,
        isBestOf3: false,
        games: []
      });
    }
  }

  return newMatches;
}

function getBracketSeeding(size: number): number[] {
  let seeding = [1, 2];
  while (seeding.length < size) {
    const nextSeeding: number[] = [];
    const currentSize = seeding.length;
    for (const seed of seeding) {
      nextSeeding.push(seed);
      nextSeeding.push(currentSize * 2 + 1 - seed);
    }
    seeding = nextSeeding;
  }
  return seeding;
}

/**
 * Transitions from Pool Play to Bracket phase.
 */
export function generateBracket(state: TournamentState, type: SessionType): TournamentState {
  // Sort final pool play standings
  const sortedPairs = [...state.pairs].sort((a, b) => {
    if (a.poolPlayWins !== b.poolPlayWins) return b.poolPlayWins - a.poolPlayWins;
    if (a.poolPlayPointDiff !== b.poolPlayPointDiff) return b.poolPlayPointDiff - a.poolPlayPointDiff;
    return b.poolPlayPointsScored - a.poolPlayPointsScored;
  });

  const numParticipants = sortedPairs.length;
  const matches: TournamentMatch[] = [];

  if (numParticipants >= 2) {
    const p = Math.pow(2, Math.ceil(Math.log2(numParticipants)));
    const seeding = getBracketSeeding(p);
    
    const numRounds = Math.log2(p);
    const matchNodes: TournamentMatch[][] = [];
    let matchCounter = 1;
    
    // Create match nodes
    for (let r = 0; r < numRounds; r++) {
      matchNodes.push([]);
      const matchesInRound = p / Math.pow(2, r + 1);
      for (let i = 0; i < matchesInRound; i++) {
        const m: TournamentMatch = {
          id: `bracket_m${state.matches.length + matchCounter}`,
          round: r + 1,
          isLosersBracket: false,
          matchNumber: state.matches.length + matchCounter,
          nextMatchId: null,
          nextLoserMatchId: null,
          teamAId: null,
          teamBId: null,
          courtId: null,
          status: 'PENDING',
          startedAtEpochMs: null,
          endedAtEpochMs: null,
          winnerTeamId: null,
          scoreA: null,
          scoreB: null,
          isBestOf3: false,
          games: []
        };
        matchNodes[r].push(m);
        matches.push(m);
        matchCounter++;
      }
    }

    // Link matches
    for (let r = 0; r < numRounds - 1; r++) {
      for (let i = 0; i < matchNodes[r].length; i++) {
        const nextMatch = matchNodes[r+1][Math.floor(i / 2)];
        matchNodes[r][i].nextMatchId = nextMatch.id;
      }
    }

    // Populate first round
    for (let i = 0; i < matchNodes[0].length; i++) {
      const seedA = seeding[i * 2];
      const seedB = seeding[i * 2 + 1];
      const pairA = seedA <= numParticipants ? sortedPairs[seedA - 1] : null;
      const pairB = seedB <= numParticipants ? sortedPairs[seedB - 1] : null;
      
      matchNodes[0][i].teamAId = pairA ? pairA.id : null;
      matchNodes[0][i].teamBId = pairB ? pairB.id : null;
    }
    
    // Resolve Byes
    for (const m of matchNodes[0]) {
      if ((m.teamAId && !m.teamBId) || (!m.teamAId && m.teamBId)) {
        m.winnerTeamId = m.teamAId || m.teamBId;
        m.status = 'COMPLETED';
        if (m.nextMatchId) {
          const next = matches.find(x => x.id === m.nextMatchId);
          if (next) {
            if (!next.teamAId) next.teamAId = m.winnerTeamId;
            else next.teamBId = m.winnerTeamId;
          }
        }
      }
    }
  }
  
  return {
    ...state,
    phase: 'BRACKET',
    matches: [...state.matches, ...matches]
  };
}

export function advanceMatchWinner(state: TournamentState, matchId: string, winnerTeamId: string): TournamentState {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return state;

  let updatedMatches = state.matches.map(m => {
    if (m.id === matchId) {
      return { ...m, winnerTeamId, status: 'COMPLETED' as any };
    }
    return m;
  });

  if (match.nextMatchId) {
    updatedMatches = updatedMatches.map(m => {
      if (m.id === match.nextMatchId) {
        const nextM = { ...m };
        if (!nextM.teamAId) {
          nextM.teamAId = winnerTeamId;
        } else if (!nextM.teamBId && nextM.teamAId !== winnerTeamId) {
          nextM.teamBId = winnerTeamId;
        }
        return nextM;
      }
      return m;
    });
  }

  return {
    ...state,
    matches: updatedMatches
  };
}

export function advanceChaosRound(state: TournamentState, players: Player[]): TournamentState {
  const currentRound = Math.max(0, ...state.matches.map(m => m.round));
  if (currentRound === 0) return state;

  const currentRoundMatches = state.matches.filter(m => m.round === currentRound);
  
  // If not all matches in this round are completed, we can't advance yet.
  if (currentRoundMatches.some(m => m.status !== 'COMPLETED')) {
    return state;
  }

  // Gather surviving pairs
  const survivingPairIds = currentRoundMatches.map(m => m.winnerTeamId).filter(Boolean) as string[];
  
  // Extract the individual players who survived
  const survivingPlayerIds: string[] = [];
  for (const pairId of survivingPairIds) {
    const pair = state.pairs.find(p => p.id === pairId);
    if (pair) {
      survivingPlayerIds.push(pair.player1Id, pair.player2Id);
    }
  }

  // If there are 2 or fewer players left, the tournament is over!
  // Wait, if it's 4 players, they form 2 pairs, and play 1 match (Finals).
  if (survivingPlayerIds.length <= 2) {
    return { ...state, phase: 'COMPLETED' };
  }

  // Shuffle the surviving individual players to form new pairs!
  const shuffledPlayers = [...survivingPlayerIds].sort(() => Math.random() - 0.5);
  
  const newPairs: TournamentPair[] = [];
  const startPairId = state.pairs.length + 1;
  for (let i = 0; i < shuffledPlayers.length; i += 2) {
    if (i + 1 < shuffledPlayers.length) {
      const p1 = players.find(p => p.id === shuffledPlayers[i]);
      const p2 = players.find(p => p.id === shuffledPlayers[i + 1]);
      newPairs.push({
        id: `chaos_pair_${startPairId + (i/2)}`,
        player1Id: shuffledPlayers[i],
        player2Id: shuffledPlayers[i + 1],
        name: `${p1?.name || 'Unknown'} & ${p2?.name || 'Unknown'}`,
        seed: startPairId + (i/2),
        poolPlayWins: 0,
        poolPlayPointDiff: 0,
        poolPlayPointsScored: 0
      });
    }
  }

  const newMatches: TournamentMatch[] = [];
  const startMatchNum = state.matches.length + 1;
  const nextRound = currentRound + 1;

  for (let i = 0; i < newPairs.length; i += 2) {
    newMatches.push({
      id: `chaos_match_${startMatchNum + (i/2)}`,
      round: nextRound,
      isLosersBracket: false,
      matchNumber: startMatchNum + (i/2),
      nextMatchId: null,
      nextLoserMatchId: null,
      teamAId: newPairs[i].id,
      teamBId: (i + 1 < newPairs.length) ? newPairs[i + 1].id : null,
      courtId: null,
      status: (i + 1 < newPairs.length) ? 'PENDING' : 'COMPLETED',
      startedAtEpochMs: null,
      endedAtEpochMs: (i + 1 < newPairs.length) ? null : Date.now(),
      winnerTeamId: (i + 1 < newPairs.length) ? null : newPairs[i].id,
      scoreA: null,
      scoreB: null,
      isBestOf3: false,
      games: []
    });
  }

  return {
    ...state,
    pairs: [...state.pairs, ...newPairs],
    matches: [...state.matches, ...newMatches],
    phase: newMatches.length === 1 && newMatches[0].status === 'COMPLETED' ? 'COMPLETED' : 'BRACKET' // if the final match was a bye, which is weird but possible
  };
}
