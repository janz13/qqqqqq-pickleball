import { TournamentState, TournamentPair, TournamentMatch, Player, SessionType } from '@/types/models';

export interface RankedTournamentItem {
  id: string; // pairId or playerId
  name: string;
  initials: string;
  photoUrl?: string | null;
  rank: number;
  wins: number;
  losses: number;
  pointsScored: number;
  pointDiff: number;
  detail: string;
  subDetail?: string;
  isPlayer?: boolean;
  pair?: TournamentPair;
  player?: Player;
  player1?: Player;
  player2?: Player;
}

export function getTeamName(pair: TournamentPair, players: Player[]): string {
  if (pair.name) return pair.name;
  const p1 = players.find(p => p.id === pair.player1Id);
  const p2 = players.find(p => p.id === pair.player2Id);
  if (p1 && p2) return `${p1.name} & ${p2.name}`;
  if (p1) return p1.name;
  if (p2) return p2.name;
  return 'Team';
}

export function getTeamInitials(pair: TournamentPair, players: Player[]): string {
  if (pair.name) return pair.name.substring(0, 2).toUpperCase();
  const p1 = players.find(p => p.id === pair.player1Id);
  const p2 = players.find(p => p.id === pair.player2Id);
  if (p1 && p2) return `${p1.name.charAt(0)}${p2.name.charAt(0)}`.toUpperCase();
  if (p1) return p1.name.substring(0, 2).toUpperCase();
  return 'T';
}

/**
 * Ranks tournament participants based on bracket-aware placement.
 */
export function rankTournament(
  tournamentState: TournamentState,
  players: Player[],
  sessionType?: SessionType
): RankedTournamentItem[] {
  if (!tournamentState || tournamentState.pairs.length === 0) {
    return [];
  }

  const { pairs, matches } = tournamentState;

  // Resolve format
  const resolvedType = sessionType || (
    matches.some(m => m.isLosersBracket || m.id.startsWith('lb_') || m.id.startsWith('gf_'))
      ? SessionType.TOURNAMENT_DOUBLES
      : matches.some(m => m.id.startsWith('chaos_'))
        ? SessionType.TOURNAMENT_CHAOS
        : SessionType.TOURNAMENT_SINGLE_ELIM
  );

  // ─────────────────────────────────────────────────────────────
  // 1. CHAOS ROULETTE (Individual Player Ranking)
  // ─────────────────────────────────────────────────────────────
  if (resolvedType === SessionType.TOURNAMENT_CHAOS) {
    // Find all players associated with the tournament pairs
    const tournamentPlayerIds = new Set<string>();
    pairs.forEach(p => {
      if (p.player1Id) tournamentPlayerIds.add(p.player1Id);
      if (p.player2Id) tournamentPlayerIds.add(p.player2Id);
    });

    const activePlayers = players.filter(p => tournamentPlayerIds.has(p.id) || p.status !== 'CHECKED_OUT');

    const playerScores = activePlayers.map(player => {
      let matchesWon = 0;
      let matchesPlayed = 0;
      const wonRounds: number[] = [];

      matches.forEach(m => {
        if (m.status === 'COMPLETED' || m.winnerTeamId) {
          const pairA = pairs.find(p => p.id === m.teamAId);
          const pairB = pairs.find(p => p.id === m.teamBId);
          const inA = pairA ? (pairA.player1Id === player.id || pairA.player2Id === player.id) : false;
          const inB = pairB ? (pairB.player1Id === player.id || pairB.player2Id === player.id) : false;

          if (inA || inB) {
            matchesPlayed++;
            const won = (inA && m.winnerTeamId === m.teamAId) || (inB && m.winnerTeamId === m.teamBId);
            if (won) {
              matchesWon++;
              wonRounds.push(m.round);
            }
          }
        }
      });

      const roundsSurvived = wonRounds.length > 0 ? Math.max(...wonRounds) : 0;
      return {
        player,
        matchesWon,
        matchesPlayed,
        roundsSurvived,
      };
    });

    playerScores.sort((a, b) => {
      if (a.roundsSurvived !== b.roundsSurvived) return b.roundsSurvived - a.roundsSurvived;
      if (a.matchesWon !== b.matchesWon) return b.matchesWon - a.matchesWon;
      return b.matchesPlayed - a.matchesPlayed;
    });

    return playerScores.map((item, idx) => ({
      id: item.player.id,
      name: item.player.name,
      initials: item.player.name.substring(0, 2).toUpperCase(),
      photoUrl: item.player.photoUrl,
      rank: idx + 1,
      wins: item.matchesWon,
      losses: item.matchesPlayed - item.matchesWon,
      pointsScored: 0,
      pointDiff: 0,
      detail: `${item.matchesWon}W (${item.roundsSurvived > 0 ? `Round ${item.roundsSurvived}` : 'Round 1'})`,
      subDetail: `${item.matchesPlayed} Matches`,
      isPlayer: true,
      player: item.player,
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // 2. SINGLE ELIMINATION (Knockout Sprint)
  // ─────────────────────────────────────────────────────────────
  if (resolvedType === SessionType.TOURNAMENT_SINGLE_ELIM) {
    const bracketMatches = matches.filter(m => !m.id.startsWith('pool_'));
    const maxRound = bracketMatches.length > 0 ? Math.max(...bracketMatches.map(m => m.round)) : 0;
    const finalsMatch = bracketMatches.find(m => m.round === maxRound && !m.id.startsWith('3rd_place_') && !m.is3rdPlaceMatch);
    const championId = finalsMatch?.winnerTeamId;
    const runnerUpId = finalsMatch && championId 
      ? (finalsMatch.winnerTeamId === finalsMatch.teamAId ? finalsMatch.teamBId : finalsMatch.teamAId) 
      : null;
    const thirdPlaceMatch = bracketMatches.find(m => m.is3rdPlaceMatch || m.id.startsWith('3rd_place_'));
    const thirdPlaceId = thirdPlaceMatch?.winnerTeamId;
    const fourthPlaceId = thirdPlaceMatch && thirdPlaceId
      ? (thirdPlaceMatch.winnerTeamId === thirdPlaceMatch.teamAId ? thirdPlaceMatch.teamBId : thirdPlaceMatch.teamAId)
      : null;

    const scoredPairs = pairs.map(pair => {
      const pairMatches = bracketMatches.filter(m => m.teamAId === pair.id || m.teamBId === pair.id);
      const wins = pairMatches.filter(m => (m.status === 'COMPLETED' || m.winnerTeamId) && m.winnerTeamId === pair.id).length;
      const losses = pairMatches.filter(m => (m.status === 'COMPLETED' || m.winnerTeamId) && m.winnerTeamId && m.winnerTeamId !== pair.id).length;
      const maxRoundPlayed = Math.max(0, ...pairMatches.map(m => m.round));

      let tier = 0;
      if (pair.id === championId) tier = 100;
      else if (pair.id === runnerUpId) tier = 90;
      else if (pair.id === thirdPlaceId) tier = 80;
      else if (pair.id === fourthPlaceId) tier = 70;
      else tier = maxRoundPlayed * 10 + wins;

      return {
        pair,
        tier,
        wins,
        losses,
        maxRoundPlayed,
        seed: pair.seed ?? 999
      };
    });

    scoredPairs.sort((a, b) => {
      if (a.tier !== b.tier) return b.tier - a.tier;
      if (a.wins !== b.wins) return b.wins - a.wins;
      return a.seed - b.seed;
    });

    return scoredPairs.map((item, idx) => {
      const p1 = players.find(p => p.id === item.pair.player1Id);
      const p2 = players.find(p => p.id === item.pair.player2Id);
      return {
        id: item.pair.id,
        name: getTeamName(item.pair, players),
        initials: getTeamInitials(item.pair, players),
        rank: idx + 1,
        wins: item.wins,
        losses: item.losses,
        pointsScored: 0,
        pointDiff: 0,
        detail: `${item.wins} Bracket ${item.wins === 1 ? 'Win' : 'Wins'}`,
        subDetail: item.tier === 100 ? 'Champion' : item.tier === 90 ? 'Runner-up' : item.tier === 80 ? '3rd Place' : item.tier === 70 ? '4th Place' : `R${item.maxRoundPlayed}`,
        isPlayer: false,
        pair: item.pair,
        player1: p1,
        player2: p2,
      };
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. DOUBLE ELIMINATION (The Grand Slam)
  // ─────────────────────────────────────────────────────────────
  // 1. Grand Finals match
  const gfMatch = matches.find(m => m.id.startsWith('gf_'));
  const gfWinnerId = gfMatch?.winnerTeamId;
  const gfLoserId = gfMatch && gfWinnerId 
    ? (gfMatch.winnerTeamId === gfMatch.teamAId ? gfMatch.teamBId : gfMatch.teamAId) 
    : null;

  // 2. Losers Bracket Finals (last LB match before GF)
  const lbMatches = matches.filter(m => m.isLosersBracket || m.id.startsWith('lb_'));
  const maxLbRound = lbMatches.length > 0 ? Math.max(...lbMatches.map(m => m.round)) : 0;
  const lbFinals = lbMatches.find(m => m.round === maxLbRound);
  const lbFinalsLoserId = lbFinals && lbFinals.winnerTeamId
    ? (lbFinals.winnerTeamId === lbFinals.teamAId ? lbFinals.teamBId : lbFinals.teamAId)
    : null;

  // 3. LB Semifinals losers = 4th
  const lbSemis = lbMatches.find(m => m.round === maxLbRound - 1);
  const lbSemisLoserId = lbSemis && lbSemis.winnerTeamId
    ? (lbSemis.winnerTeamId === lbSemis.teamAId ? lbSemis.teamBId : lbSemis.teamAId)
    : null;

  // 4. Remaining pairs: sort by:
  //    (a) whether eliminated from WB or LB
  //    (b) round eliminated
  //    (c) pool play wins tiebreaker
  const wbMatches = matches.filter(m => !m.isLosersBracket && !m.id.startsWith('gf_') && !m.id.startsWith('pool_'));

  const scoredPairs = pairs.map(pair => {
    let placementTier = 0;
    let roundEliminated = 0;
    let eliminatedFrom: 'GF' | 'LB' | 'WB' | 'NONE' = 'NONE';

    if (pair.id === gfWinnerId) {
      placementTier = 10;
      eliminatedFrom = 'NONE';
    } else if (pair.id === gfLoserId) {
      placementTier = 9;
      eliminatedFrom = 'GF';
    } else if (pair.id === lbFinalsLoserId) {
      placementTier = 8;
      eliminatedFrom = 'LB';
      roundEliminated = maxLbRound;
    } else if (pair.id === lbSemisLoserId) {
      placementTier = 7;
      eliminatedFrom = 'LB';
      roundEliminated = maxLbRound - 1;
    } else {
      const lbLoss = lbMatches.find(m => m.winnerTeamId && m.winnerTeamId !== pair.id && (m.teamAId === pair.id || m.teamBId === pair.id));
      const wbLoss = wbMatches.find(m => m.winnerTeamId && m.winnerTeamId !== pair.id && (m.teamAId === pair.id || m.teamBId === pair.id));

      if (lbLoss) {
        placementTier = 4;
        eliminatedFrom = 'LB';
        roundEliminated = lbLoss.round;
      } else if (wbLoss) {
        // Lost in WB, alive in LB
        placementTier = 5;
        eliminatedFrom = 'WB';
        roundEliminated = wbLoss.round;
      } else {
        // Undefeated in WB
        placementTier = 6;
        eliminatedFrom = 'NONE';
        const maxWb = Math.max(0, ...wbMatches.filter(m => m.teamAId === pair.id || m.teamBId === pair.id).map(m => m.round));
        roundEliminated = maxWb;
      }
    }

    return {
      pair,
      placementTier,
      roundEliminated,
      eliminatedFrom,
      poolPlayWins: pair.poolPlayWins ?? 0,
      poolPlayPointDiff: pair.poolPlayPointDiff ?? 0,
      poolPlayPointsScored: pair.poolPlayPointsScored ?? 0,
    };
  });

  scoredPairs.sort((a, b) => {
    if (a.placementTier !== b.placementTier) return b.placementTier - a.placementTier;
    if (a.roundEliminated !== b.roundEliminated) return b.roundEliminated - a.roundEliminated;
    if (a.poolPlayWins !== b.poolPlayWins) return b.poolPlayWins - a.poolPlayWins;
    if (a.poolPlayPointDiff !== b.poolPlayPointDiff) return b.poolPlayPointDiff - a.poolPlayPointDiff;
    return b.poolPlayPointsScored - a.poolPlayPointsScored;
  });

  return scoredPairs.map((item, idx) => {
    const p1 = players.find(p => p.id === item.pair.player1Id);
    const p2 = players.find(p => p.id === item.pair.player2Id);
    return {
      id: item.pair.id,
      name: getTeamName(item.pair, players),
      initials: getTeamInitials(item.pair, players),
      rank: idx + 1,
      wins: item.poolPlayWins,
      losses: 0,
      pointsScored: item.poolPlayPointsScored,
      pointDiff: item.poolPlayPointDiff,
      detail: `${item.poolPlayWins}W (${item.poolPlayPointDiff > 0 ? '+' : ''}${item.poolPlayPointDiff})`,
      subDetail: `${item.poolPlayPointsScored} Pts`,
      isPlayer: false,
      pair: item.pair,
      player1: p1,
      player2: p2,
    };
  });
}
