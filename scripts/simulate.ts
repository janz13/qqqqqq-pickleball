import { Player, PlayerStatus, Court, CourtStatus, Match, Team, createPlayer } from '../src/types/models';
import { buildNextBatches } from '../src/engine/queue-engine';
import { pairFour } from '../src/engine/pairing-engine';
import * as fs from 'fs';

// Helper to generate a random number
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// Generate 44 initial players
let players: Player[] = [];
for (let i = 1; i <= 44; i++) {
  players.push(createPlayer({
    id: `p${i}`,
    name: `Player ${i}`,
    skillLevel: rand(1, 5),
    status: PlayerStatus.AVAILABLE,
    queuedAtEpochMs: Date.now() - rand(0, 10000), // slightly staggered
    joinedSessionAtEpochMs: Date.now()
  }));
}

// Lock 3 pairs (6 players)
const lockPair = (p1Id: string, p2Id: string) => {
  const p1 = players.find(p => p.id === p1Id);
  const p2 = players.find(p => p.id === p2Id);
  if (p1 && p2) {
    p1.lockedPartnerId = p2.id;
    p2.lockedPartnerId = p1.id;
  }
};
lockPair('p1', 'p2');
lockPair('p10', 'p11');
lockPair('p20', 'p21');

const courts: Court[] = Array.from({ length: 5 }, (_, i) => ({
  id: `c${i + 1}`,
  label: `Court ${i + 1}`,
  status: CourtStatus.OPEN,
  currentMatchId: null
}));

let matches: Match[] = [];
let round = 1;

const NUM_ROUNDS = 20;

let metrics = {
  ruleViolations: 0,
  lockedPairsViolated: 0,
  skillGapViolations: 0,
  skillGapDetails: [] as string[]
};

// Simulation Loop
while (round <= NUM_ROUNDS) {
  // Add Latecomers at round 6
  if (round === 6) {
    for (let i = 45; i <= 48; i++) {
      players.push(createPlayer({
        id: `p${i}`,
        name: `Latecomer ${i}`,
        skillLevel: rand(2, 4),
        status: PlayerStatus.AVAILABLE,
        queuedAtEpochMs: Date.now(),
        joinedSessionAtEpochMs: Date.now(),
        isLatecomer: true,
        catchUpTargetGames: Math.floor(
          players.reduce((sum, p) => sum + p.sessionGamesPlayed, 0) / players.length
        ),
        hasCaughtUp: false
      }));
    }
  }

  // Update hasCaughtUp status
  const avgGames = players.reduce((sum, p) => sum + p.sessionGamesPlayed, 0) / players.length;
  players.forEach(p => {
    if (p.isLatecomer && p.sessionGamesPlayed >= p.catchUpTargetGames) {
      p.hasCaughtUp = true;
    }
  });

  // Calculate next matches
  const availableCourts = courts.filter(c => c.status === CourtStatus.OPEN);
  if (availableCourts.length === 0) break;

  const proposedBatches = buildNextBatches(players, availableCourts.length);
  const proposedMatches = proposedBatches.map(b => pairFour(b));
  
  // Assign top N matches to courts
  const matchesToPlay = proposedMatches.slice(0, availableCourts.length);

  matchesToPlay.forEach((pm, idx) => {
    const court = availableCourts[idx];
    const matchId = `m_${round}_${idx}`;
    const tA = pm.teamA.map(p => p.id);
    const tB = pm.teamB.map(p => p.id);
    
    // Create Match
    const newMatch: Match = {
      id: matchId,
      courtId: court.id,
      teamA: tA,
      teamB: tB,
      startedAtEpochMs: Date.now(),
      endedAtEpochMs: null,
      winner: null,
      scoreA: null,
      scoreB: null
    };
    matches.push(newMatch);

    // Validate rules
    const allPlayersInMatch = [...pm.teamA, ...pm.teamB];
    const isLockedPairPresent = allPlayersInMatch.some(p => p.lockedPartnerId);
    
    // Check locked pairs
    pm.teamA.forEach(p => {
      if (p.lockedPartnerId && !tA.includes(p.lockedPartnerId)) metrics.lockedPairsViolated++;
    });
    pm.teamB.forEach(p => {
      if (p.lockedPartnerId && !tB.includes(p.lockedPartnerId)) metrics.lockedPairsViolated++;
    });

    // Check skill gap (if no locked pair is forcing a weird match)
    if (!isLockedPairPresent) {
      const skills = allPlayersInMatch.map(p => p.skillLevel);
      const maxSkill = Math.max(...skills);
      const minSkill = Math.min(...skills);
      if (maxSkill - minSkill > 1.5) {
        metrics.skillGapViolations++;
        metrics.skillGapDetails.push(`Match ${matchId}: Max ${maxSkill}, Min ${minSkill}`);
      }
    }

    // Update Player statuses to IN_PROGRESS (Simulation only needs logic)
    allPlayersInMatch.forEach(p => {
      const player = players.find(x => x.id === p.id)!;
      player.status = PlayerStatus.PLAYING;
      player.currentCourtId = court.id;
    });
  });

  // Complete Matches (simulate 15 mins passing)
  // We'll just complete them immediately for next round
  matches.filter(m => !m.endedAtEpochMs).forEach(m => {
    m.endedAtEpochMs = Date.now() + 15 * 60000;
    const winner = Math.random() > 0.5 ? Team.A : Team.B;
    m.winner = winner;
    
    [...m.teamA, ...m.teamB].forEach(pid => {
      const p = players.find(x => x.id === pid)!;
      p.status = PlayerStatus.AVAILABLE;
      p.currentCourtId = null;
      p.sessionGamesPlayed++;
      
      const isTeamA = m.teamA.includes(p.id);
      if ((isTeamA && winner === Team.A) || (!isTeamA && winner === Team.B)) {
        p.sessionWins++;
      } else {
        p.sessionLosses++;
      }
      
      p.queuedAtEpochMs = Date.now(); // Put back at end of line
      
      // Update history
      const partnerIds = isTeamA ? m.teamA.filter(id => id !== p.id) : m.teamB.filter(id => id !== p.id);
      const opponentIds = isTeamA ? m.teamB : m.teamA;
      p.recentPartnerIds = [...p.recentPartnerIds, ...partnerIds].slice(-3);
      p.recentOpponentIds = [...p.recentOpponentIds, ...opponentIds].slice(-3);
    });
  });

  round++;
}

const results = {
  totalPlayers: players.length,
  totalMatches: matches.length,
  metrics,
  players: players.map(p => ({
    id: p.id,
    name: p.name,
    isLatecomer: p.isLatecomer,
    skill: p.skillLevel,
    games: p.sessionGamesPlayed,
    locked: p.lockedPartnerId
  }))
};

fs.writeFileSync('simulation_results_3.json', JSON.stringify(results, null, 2));
console.log('Simulation complete. Results saved to simulation_results_3.json');
