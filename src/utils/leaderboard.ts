import { Player, Match, Team } from '@/types/models';

export function getSortedPlayers(players: Player[], matches: Match[]): Player[] {
  // Calculate exact total time played and avg opponent skill per player
  const playerStats = new Map<string, { timePlayed: number, totalOpponentSkill: number, matchCount: number }>();

  for (const player of players) {
    playerStats.set(player.id, { timePlayed: 0, totalOpponentSkill: 0, matchCount: 0 });
  }

  for (const match of matches) {
    if (!match.endedAtEpochMs) continue;
    const duration = match.endedAtEpochMs - match.startedAtEpochMs;
    
    // Average skill of Team A and Team B
    let teamASkill = 0;
    let teamBSkill = 0;
    
    const aPlayers = match.teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
    const bPlayers = match.teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
    
    if (aPlayers.length) teamASkill = aPlayers.reduce((sum, p) => sum + p.skillLevel, 0) / aPlayers.length;
    if (bPlayers.length) teamBSkill = bPlayers.reduce((sum, p) => sum + p.skillLevel, 0) / bPlayers.length;

    for (const id of match.teamA) {
      const stats = playerStats.get(id);
      if (stats) {
        stats.timePlayed += duration;
        stats.totalOpponentSkill += teamBSkill;
        stats.matchCount++;
      }
    }
    
    for (const id of match.teamB) {
      const stats = playerStats.get(id);
      if (stats) {
        stats.timePlayed += duration;
        stats.totalOpponentSkill += teamASkill;
        stats.matchCount++;
      }
    }
  }

  return [...players].sort((a, b) => {
    // 1. Session Wins
    if (b.sessionWins !== a.sessionWins) return b.sessionWins - a.sessionWins;
    
    // 2. Win Percentage
    const aWinPct = a.sessionGamesPlayed > 0 ? a.sessionWins / a.sessionGamesPlayed : 0;
    const bWinPct = b.sessionGamesPlayed > 0 ? b.sessionWins / b.sessionGamesPlayed : 0;
    if (bWinPct !== aWinPct) return bWinPct - aWinPct;
    
    // 3. Least amount of time played
    const aStats = playerStats.get(a.id) || { timePlayed: 0, totalOpponentSkill: 0, matchCount: 0 };
    const bStats = playerStats.get(b.id) || { timePlayed: 0, totalOpponentSkill: 0, matchCount: 0 };
    if (aStats.timePlayed !== bStats.timePlayed) return aStats.timePlayed - bStats.timePlayed;
    
    // 4. Harder opponents (highest avg opponent skill)
    const aAvgOppSkill = aStats.matchCount > 0 ? aStats.totalOpponentSkill / aStats.matchCount : 0;
    const bAvgOppSkill = bStats.matchCount > 0 ? bStats.totalOpponentSkill / bStats.matchCount : 0;
    return bAvgOppSkill - aAvgOppSkill;
  });
}
